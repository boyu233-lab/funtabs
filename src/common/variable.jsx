// Xtab 自托管版：所有接口指向同源（我们自己的 NAS 后端），
// 不再请求原作者服务器 api.funtabs.cn。
const api = "";

const variable = {
	// 上传（图片/壁纸/图标统一走后端 /api/upload）
	uploadImages: api + "/api/upload",
	uploadFavicon: api + "/api/upload",
	// 抓取网页标题 / 图标（后端代理，解决跨域）
	webTitle: api + "/api/webtitle?url=",
	favicon: api + "/api/favicon?url=",
	// 热搜榜（后端聚合代理）
	hotEvent: api + "/api/hotEvent",
	// 翻译（后端代理）
	fanyi: api + "/api/fanyi",
	// 中国节假日（timor.tech 公共 API，免费、支持跨域）
	festival: "https://timor.tech/api/holiday/year/",
	// 文章卡片内容抓取（后端未实现时会优雅降级，仅影响文章卡片）
	getArticleContent: api + "/api/article?url=",
};
export default variable;
