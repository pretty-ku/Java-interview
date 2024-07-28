class SyncToVika {
  constructor(nocodb, myCustomizedFields, mySyncSetting, tp, app) {
    this.nocodb = nocodb
    this.dbName = "Vika"
    this.myCustomizedFields = myCustomizedFields
    this.mySyncSetting = mySyncSetting
    this.showDbLinkInFM = this.mySyncSetting.showVikaLinkInFrontMatter
    this.app = app
    this.tp = tp
    this.fmProperties = {
      recordID: "recordID",
      dbLink: "vikalink",
    }

    this.texts = {
      searchTitle: "输入你想查找的关键字：",
      notFindAnything: "没有找到任何记录，请重试",
      searchCanceled: "搜索已取消",
      syncToOBSuccess: `从${this.dbName}同步成功`,
      updateOptions: [
        `更新笔记内容到${this.dbName}`,
        `更新${this.dbName}内容到笔记`,
        "取消",
      ],
      createOptions: [
        `在${this.dbName}中创建新纪录`,
        `从${this.dbName}获取笔记`,
      ],
      deleteOptions: [
        `⚠️ 删除${this.dbName}上的笔记内容`,
        "⚠️ 删除笔记文件",
        `⚠️ 同时删除笔记和${this.dbName}内容`,
      ],
    }

    this.utils = new Utils()

    this.setEnviromentsVariables()
    this.prepareSyncData()
  }

  setEnviromentsVariables() {
    const nocodb = this.nocodb
    const tp = this.tp
    const utils = this.utils
    const app = this.app
    const mySyncSetting = this.mySyncSetting
    const myCustomizedFields = this.myCustomizedFields

    this.url = `https://api.${this.dbName.toLowerCase()}.cn/fusion/v1/datasheets/${
      nocodb.sheetId
    }/records?fieldKey=name`
    this.retriveUrl =
      this.url +
      "&recordIds=" +
      (tp.frontmatter[this.fmProperties.recordID] ?? "")

    this.filePath = encodeURI(tp.file.path(true))
    this.vault = encodeURI(app.vault.getName())
    this.oburi = `obsidian://open?vault=${this.vault}&file=${this.filePath}`

    this.obAdvancedURI = `obsidian://advanced-uri?vault=${this.vault}&uid=`

    this.currentFile = app.workspace.getActiveFile()
    this.cache = app.metadataCache.getFileCache(this.currentFile)

    this.frontmatter = this.cache.frontmatter
    this.currentView = app.workspace.activeLeaf.view

    this.cmDoc = this.currentView.sourceMode.cmEditor
    this.path = this.currentFile.path

    this.content = utils.contentArray(this.currentView, this.frontmatter)
    this.syncContent = utils.syncedContent(
      this.content,
      mySyncSetting.syncDbLink,
      mySyncSetting.howManyLinesSynced,
      nocodb
    )

    this.newFM = utils.pureFm(this.frontmatter)

    this.allTags = (
      tp.obsidian.getAllTags(this.cache).filter(utils.onlyUnique) || []
    ).map((t) => t.replace("#", ""))

    this.newFM.tags = this.allTags

    this.aliases = tp.obsidian.parseFrontMatterAliases(this.frontmatter) || []

    this.newFM.aliases = this.aliases

    this.outLinks = this.cache.links
      ? this.cache.links.map((n) => n.displayText).filter(utils.onlyUnique)
      : []

    this.backLinks = utils.getBackLinks(app.metadataCache, this.path)

    this.unresolvedOutLinks = utils.getUnresolvedOutLinks(
      app.metadataCache,
      this.path
    )

    this.resolvedOutLinks = utils.getResolvedOutLinks(
      this.outLinks,
      this.unresolvedOutLinks
    )
  }

  prepareSyncData() {
    const utils = this.utils
    const tp = this.tp
    this.defaultData = {
      ID: tp.file.creation_date("YYYYMMDDHHMMSS"),
      Title: tp.frontmatter.title ?? tp.file.title,
      FileName: tp.file.title,
      OBURI: tp.frontmatter[this.fmProperties.recordID]
        ? this.obAdvancedURI + tp.frontmatter[this.fmProperties.recordID]
        : this.oburi,
      Vault: this.vault,
      Tags: this.allTags,
      Aliases: this.aliases,
      OutLinks: this.resolvedOutLinks,
      BackLinks: this.backLinks,
      UnresolvedOutLinks: this.unresolvedOutLinks,
      CreatedTime: tp.file.creation_date("YYYY-MM-DD HH:mm"),
      UpdatedTime: tp.file.last_modified_date("YYYY-MM-DD HH:mm"),
    }
    this.myCustomizedData = utils.makeCustomizedData(
      this.myCustomizedFields,
      this.frontmatter,
      tp
    )
    this.myNoteContent = {
      Content: this.syncContent.join("\r"),
    }
    this.syncData = {
      records: [
        {
          recordId: tp.frontmatter[this.fmProperties.recordID],
          fields: {
            ...this.defaultData,
            ...this.myCustomizedData,
            ...this.myNoteContent,
          },
        },
      ],
    }
  }

  async sync() {
    const tp = this.tp
    const nocodb = this.nocodb
    const retriveUrl = this.retriveUrl
    const mySyncSetting = this.mySyncSetting
    const currentFile = this.currentFile
    const url = this.url
    const data = this.syncData
    const newFM = this.newFM
    const cmDoc = this.cmDoc
    const utils = this.utils
    let options = this.texts.updateOptions

    if (mySyncSetting.showDeleteModal) {
      options = [...this.texts.updateOptions, ...this.texts.deleteOptions]
    }

    if (
      tp.frontmatter[this.fmProperties.recordID] &&
      (await this.hasRecord(retriveUrl, nocodb.apiKey))
    ) {
      let syncOption =
        (await tp.system.suggester(options, [...options.keys()])) ?? 2

      switch (syncOption) {
        case 0:
          await this.updateNocodbRecord(url, data, nocodb.apiKey)
          break
        case 1:
          await this.syncNocodbToOB(retriveUrl, nocodb.apiKey)
          break
        case 3:
          await this.deleteNocodbRecord(
            nocodb,
            tp.frontmatter[this.fmProperties.recordID]
          )
          break
        case 4:
          await this.deleteFile(currentFile)
          break
        case 5:
          await this.deleteNocodbRecord(
            nocodb,
            tp.frontmatter[this.fmProperties.recordID]
          )
          await this.deleteFile(currentFile)
          break
        case 2:
          break
        default:
          await this.updateNocodbRecord(url, data, nocodb.apikey)
      }
    } else {
      let createOptions =
        (await tp.system.suggester(this.texts.createOptions, [1, 2])) ?? 0

      switch (createOptions) {
        case 1:
          await this.createNocodbRecord(url, data, nocodb.apiKey, newFM, cmDoc)
          break
        case 2:
          const record = await this.getNocodbRecordsByKeywords()
          if (record) {
            utils.renderDoc(
              cmDoc,
              this.prepareFinalFM(record),
              this.prepareDBLink(record),
              record.fields.Content ?? ""
            )
            this.currentView.save()
          } else {
          }
          break
        default:
          break
      }
    }
  }

  async hasRecord(url, key) {
    const data = await this.getNocodbRecord(url, key)
    return data.length ? true : false
  }

  async getNocodbRecord(url, key) {
    const data = await fetch(url, {
      headers: { Authorization: "Bearer " + key },
    })
      .then((response) => response.json())
      .then((data) => {
        return data.data.records
      })
    return data
  }

  async createNocodbRecord(url, data, apiKey, newFM, cmDoc) {
    data.records.first().recordId = undefined

    const utils = this.utils
    const nocodb = this.nocodb
    const mySyncSetting = this.mySyncSetting
    const content = this.content
    const tp = this.tp
    const res = await fetch(url, {
      body: JSON.stringify(data),
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      method: "POST",
    })
      .then((response) => response.json())
      .then((data) => {
        let res = data.data.records[0]
        let finalFm = this.prepareFinalFM(res)
        let dbLink = mySyncSetting.showDbLink
          ? utils.makeDbLink(
              utils.makeFmDbLink(nocodb, res.recordId),
              this.dbName
            )
          : ""
        utils.renderDoc(cmDoc, finalFm, dbLink, content.join("\n"))
        utils.showNotice(
          "笔记：" + res.fields.Title + ` 在${this.dbName}中创建完成`,
          mySyncSetting.noticeType,
          tp
        )
      })
      .catch((error) => {
        utils.showNotice(error.message, mySyncSetting.noticeType, tp)
      })
    this.currentView.save()
    return res
  }

  prepareDBLink(res) {
    return this.mySyncSetting.showDbLink
      ? this.utils.makeDbLink(
          this.utils.makeFmDbLink(this.nocodb, res.recordId),
          this.dbName
        )
      : ""
  }

  prepareFinalFM(res) {
    let myCustomizedFields = this.myCustomizedFields
    if (this.showDbLinkInFM) {
      this.newFM[this.fmProperties.dbLink] = this.utils.makeFmDbLink(
        this.nocodb,
        res.recordId
      )
    }
    this.newFM.title = res.fields.Title
    this.newFM[this.fmProperties.recordID] = res.recordId
    this.newFM.uid = res.recordId
    if (res.fields.Aliases) {
      this.newFM.aliases = [
        ...this.newFM.aliases,
        ...res.fields.Aliases,
      ].filter(this.utils.onlyUnique)
    }
    if (res.fields.Tags) {
      this.newFM.tags = [...this.newFM.tags, ...res.fields.Tags].filter(
        this.utils.onlyUnique
      )
    }
    if (!this.newFM.tags.length) {
      delete this.newFM.tags
    }
    if (!this.newFM.aliases.length) {
      delete this.newFM.aliases
    }

    /* Custom Fields Update */

    if (Object.keys(myCustomizedFields) !== 0) {
      for (const [key, value] of Object.entries(myCustomizedFields)) {
        if (value instanceof Array) {
          this.newFM[key] = [...res.fields[key]].filter(this.utils.onlyUnique)
        } else {
          this.newFM[key] = res.fields[key]
        }
      }
    }

    return this.utils.makeFm(this.newFM)
  }

  async updateNocodbRecord(url, data, apiKey) {
    const mySyncSetting = this.mySyncSetting
    const utils = this.utils
    const cmDoc = this.cmDoc
    const content = this.content
    const nocodb = this.nocodb
    const newFM = this.newFM

    const res = await fetch(url, {
      body: JSON.stringify(data),
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      method: "PATCH",
    })
      .then((response) => response.json())
      .then((data) => {
        const record = data.data.records[0]
        const recordFields = record.fields

        if (this.showDbLinkInFM) {
          newFM[this.fmProperties.dbLink] = utils.makeFmDbLink(
            nocodb,
            record.recordId
          )
        } else {
          delete newFM[this.fmProperties.dbLink]
        }

        if (
          mySyncSetting.showDbLink &&
          content.join("").indexOf(nocodb.sheetId) === -1
        ) {
          utils.renderDoc(
            cmDoc,
            this.prepareFinalFM(record),
            utils.makeDbLink(
              utils.makeFmDbLink(nocodb, record.recordId),
              this.dbName
            ),
            content.join("\n")
          )
        } else if (
          !mySyncSetting.showDbLink &&
          content.join("").indexOf(nocodb.sheetId) !== -1
        ) {
          utils.renderDoc(
            cmDoc,
            this.prepareFinalFM(record),
            "",
            content.slice(4).join("\n")
          )
        } else {
          utils.renderDoc(
            cmDoc,
            this.prepareFinalFM(record),
            "",
            content.join("\n")
          )
        }

        utils.showNotice(
          "笔记：" + recordFields.Title + ` 在${this.dbName}中更新成功`,
          mySyncSetting.noticeType,
          this.tp
        )
      })
      .catch((error) => {
        utils.showNotice(error.message, mySyncSetting.noticeType, this.tp)
      })
    this.currentView.save()
    return res
  }

  async deleteNocodbRecord(nocodb, rid) {
    const utils = this.utils
    const url = `https://api.${this.dbName.toLowerCase()}.cn/fusion/v1/datasheets/${
      nocodb.sheetId
    }/records?recordIds=${rid}`
    return await fetch(url, {
      headers: {
        Authorization: "Bearer " + nocodb.apiKey,
      },
      method: "DELETE",
    })
      .then((response) => response.json())
      .then((data) => {
        utils.showNotice(
          `笔记在${this.dbName}中删除成功`,
          this.mySyncSetting.noticeType,
          this.tp
        )
      })
  }

  async deleteFile(file) {
    try {
      await this.app.vault.trash(file, true)
    } catch (error) {
      this.utils.showNotice(error, this.mySyncSetting.noticeType, this.tp)
    }
  }

  /* Todo: find out better way to check conflict */
  async checkConflict() {
    const records = await this.getNocodbRecord(
      this.retriveUrl,
      this.nocodb.apiKey
    )
    const data = records.first()
    const obOldModifiedTime = data.fields.UpdatedTime
    const obNewModifiedTime = +this.tp.file.last_modified_date("x")
    const vikaModifiedTime = data.updatedAt
  }

  async syncNocodbToOB(url, key) {
    const utils = this.utils
    const cmDoc = this.cmDoc
    const content = this.content

    const data = await this.getNocodbRecord(url, key)
    const record = data.first()
    let syncContent
    let dbContent = record.fields.Content ?? ""
    if (-1 !== this.mySyncSetting.howManyLinesSynced) {
      syncContent = content.join("\n")
    } else {
      switch (this.mySyncSetting.dbToObMood) {
        case 1:
          syncContent = dbContent ?? content.join("\n")
          break
        case 2:
          syncContent =
            `==来自${this.dbName}的内容==` +
            "\n" +
            dbContent +
            "\n" +
            `==原来的内容==` +
            "\n" +
            content.join("\n")
          break
        case 3:
          syncContent =
            `==原来的内容==` +
            "\n" +
            content.join("\n") +
            `==来自${this.dbName}的内容==` +
            "\n" +
            dbContent
          break
        default:
          syncContent = dbContent ?? content.join("\n")
      }
    }
    utils.renderDoc(
      cmDoc,
      this.prepareFinalFM(record),
      this.prepareDBLink(record),
      syncContent
    )
    this.tp.file.rename(record.fields.FileName)
    this.currentView.save()
    utils.showNotice(
      this.texts.syncToOBSuccess,
      this.mySyncSetting.noticeType,
      this.tp
    )
  }

  async getNocodbRecordsByKeywords() {
    let url = `https://api.${this.dbName.toLowerCase()}.cn/fusion/v1/datasheets/${
      this.nocodb.sheetId
    }/records?`
    let params = new URLSearchParams()
    let formula
    let searchItem = (await this.tp.system.prompt(this.texts.searchTitle)) ?? ""
    let searchQuery = searchItem.split("/")
    if (searchQuery.length === 1) {
      formula = `OR(FIND("${searchItem}",{Title}),FIND("${searchItem}",{Content}),FIND("${searchItem}",{Aliases}),FIND("${searchItem}",{Tags}),FIND("${searchItem}",{FileName}))`
    } else {
      const searchIn = searchQuery.shift()
      searchItem = searchQuery.join().trim()
      switch (searchIn.toLowerCase()) {
        case "h":
          formula = `FIND("${searchItem}",{Title})`
          break
        case "c":
          formula = `FIND("${searchItem}",{Content})`
          break
        case "a":
          formula = `FIND("${searchItem}",{Aliases})`
          break
        case "t":
          formula = `FIND("${searchItem}",{Tags})`
          break
        case "f":
          formula = `FIND("${searchItem}",{FileName})`
          break
        default:
          formula = `OR(FIND("${searchItem}",{Title}),FIND("${searchItem}",{Content}),FIND("${searchItem}",{Aliases}),FIND("${searchItem}",{Tags}),FIND("${searchItem}",{FileName}))`
      }
    }

    if (searchItem) {
      let data
      params.append("filterByFormula", formula)
      url = url + params.toString()
      data = await this.getNocodbRecord(url, this.nocodb.apiKey)
      if (data.length) {
        const select = await this.tp.system.suggester(
          (item) => item.fields.Title,
          data
        )
        return select
      } else {
        this.utils.showNotice(
          this.texts.notFindAnything,
          this.mySyncSetting.noticeType,
          this.tp
        )
        return null
      }
    } else {
      this.utils.showNotice(
        this.texts.searchCanceled,
        this.mySyncSetting.noticeType,
        this.tp
      )
    }
  }
}

class Utils {
  contentArray(view, fm) {
    const docArray = view.sourceMode.cmEditor.getValue().split("\n")
    let startLine = fm ? fm.position.end.line + 1 : 0
    return docArray.slice(startLine)
  }

  syncedContent(content, syncDbLink, syncedLines, nocodb) {
    let tempContent
    if (!syncDbLink && content.join("").indexOf(nocodb.sheetId) != -1) {
      tempContent = content.slice(5)
    } else {
      tempContent = content
    }

    if (syncedLines < 0) {
      return tempContent
    } else {
      return tempContent.slice(0, syncedLines)
    }
  }

  pureFm(fm) {
    if (fm instanceof Object) {
      const frontmatterArray = Object.entries(fm).filter(
        ([key, value]) => key !== "position"
      )
      return Object.fromEntries(frontmatterArray)
    } else {
      return Object.create({})
    }
  }

  makeFm(fm, fullfm = true) {
    let fmOnlyText = Object.entries(fm)
      .map(([key, value]) => key + ": " + this.makeFmValue(value))
      .join("\n")
    let fmFull = `---
${fmOnlyText}
---
`
    return fullfm ? fmFull : fmOnlyText
  }

  makeFmValue(value) {
    if (value instanceof Array) {
      return "\n" + value.map((item) => " - " + item).join("\r")
    } else {
      return value
    }
  }

  prepareFMItem() {}

  onlyUnique(value, index, self) {
    return self.indexOf(value) === index
  }

  getBackLinks(metadataCache, path) {
    return Object.entries(metadataCache.resolvedLinks)
      .filter(([k, v]) => Object.keys(v).length)
      .filter((item) => item[1].hasOwnProperty(path))
      .map((item) => {
        return item[0].split("/").pop().replace(".md", "")
      })
  }

  getUnresolvedOutLinks(metadataCache, path) {
    return Object.entries(metadataCache.unresolvedLinks)
      .filter(([k, v]) => Object.keys(v).length)
      .filter((item) => item[0] == path)
      .map((item) => Object.keys(item[1]))
      .flat()
  }

  getResolvedOutLinks(outLinks, unresolvedOutLinks) {
    if (!outLinks.length) return []
    if (!unresolvedOutLinks.length) return outLinks
    return outLinks.filter((item) => unresolvedOutLinks.indexOf(item) === -1)
  }

  makeCustomizedData(myCustomizedFields, frontmatter, tp) {
    let data = {}
    if (Object.keys(myCustomizedFields) !== 0) {
      for (const [key, value] of Object.entries(myCustomizedFields)) {
        if (value instanceof Array) {
          let arrayData =
            tp.obsidian.parseFrontMatterStringArray(frontmatter, key) || value
          data[key] = arrayData.filter(this.onlyUnique)
        } else {
          data[key] =
            tp.obsidian.parseFrontMatterEntry(frontmatter, key) || value || null
        }
      }
    }
    return data
  }

  showNotice(message, noticeType, tp) {
    switch (noticeType) {
      case 0:
        console.log(message)
        break
      case 1:
        new tp.obsidian.Notice(message)
        break
      case 2:
        new Notification(message)
        break
      default:
        new tp.obsidian.Notice(message)
    }
  }

  renderDoc(cmDoc, fm, link, content) {
    const fullContent = fm + link + content
    cmDoc.setValue(fullContent)
  }

  makeDbLink(fmLink, dbName) {
    let link = `[在${dbName}中查看笔记](${fmLink})`
    return "\n" + link + "\n\n" + "---" + "\n"
  }

  makeFmDbLink(nocodb, rid) {
    return `https://vika.cn/workbench/${nocodb.sheetId}/${rid}`
  }
}

async function obVika(nocodb, myCustomizedFields, mySyncSetting, tp, app) {
  let nocodbSync = new SyncToVika(
    nocodb,
    myCustomizedFields,
    mySyncSetting,
    tp,
    app
  )
  await nocodbSync.sync()
}

module.exports = obVika
