<%* 
//@@！！启用必填
//sheetID必填，确认是哪张表，
//viewId :（选填）视图ID。默认为维格表中第一个视图。请求会返回视图中经过视图中筛选/排序后的结果，可以搭配使用fields参数过滤不需要的字段数据。
//apiKey: 必填，验证身份 类似token
const vika = {
	sheetId: "dstC8k37V8vAARoWKy",
	viewId: "viw8w9Tmmysh6",
	apiKey: "uskq9Fbu2byTInQtXipGohl"
}
//添加自定义的yml标签
const myCustomizedFields = {
		Authors: ['kutu']
}

const mySyncSetting = {
	// 是否在Frontmatter区下方添加一个Vika访问链接
	showDbLink: false,
	// 是否显示确定删除或更新的窗口，如果为fasle则只进行更新
	showDeleteModal: true,
	// 是否在同步的笔记内容中放入开头的Vika点击链接
	syncDbLink: false,
	// 正文内容同步多少行到Vika，-1 表示全部同步，0 表示不同步，其他整数表示对应行数
	howManyLinesSynced: -1,
	// 在线数据库的笔记内容同步到OB的方式, 1 表示用在线内容覆盖OB里的内容，2 表示把在线内容放到OB内容的前面，3表示把在线内容放到OB内容的后面
	dbToObMood: 1,
	// 是否在FrontMatter区显示Vika链接
	showVikaLinkInFrontMatter: false,
	// 同步提醒的显示方式，0 表示在console中显示，1 表示用Obsidian的提醒，2 表示用系统提醒
	noticeType: 1
}

//模式只能二选一
//模式一.markdown的具体内容也同步上传
await tp.user.ObVika(vika, myCustomizedFields, mySyncSetting, tp, this.app)

//模式二.markdown的具体内容不同步
//await tp.user.ObVika_Exclude_Content(vika, myCustomizedFields, mySyncSetting, tp, this.app)
%>