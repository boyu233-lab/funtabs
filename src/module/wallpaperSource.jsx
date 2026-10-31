//建立资源分类
const wallpaperSourceClass = [
	{ label: "静态壁纸", key: "1" },
	{ label: "动态壁纸", key: "0" },
];

// Xtab 自托管版：预置壁纸改用 picsum 固定种子图（稳定、无需第三方存储），
// 不再依赖原作者的 OSS 资源
const wallpaperSource = [
	{
		type: "image",
		pre: "https://picsum.photos/seed/xtab-mountain/400/225",
		url: "https://picsum.photos/seed/xtab-mountain/1920/1080",
		class: "1",
		fontColor: "#ffffff",
	},
	{
		type: "image",
		pre: "https://picsum.photos/seed/xtab-forest/400/225",
		url: "https://picsum.photos/seed/xtab-forest/1920/1080",
		class: "1",
		fontColor: "#ffffff",
	},
	{
		type: "image",
		pre: "https://picsum.photos/seed/xtab-sea/400/225",
		url: "https://picsum.photos/seed/xtab-sea/1920/1080",
		class: "1",
		fontColor: "#ffffff",
	},
	{
		type: "image",
		pre: "https://picsum.photos/seed/xtab-city/400/225",
		url: "https://picsum.photos/seed/xtab-city/1920/1080",
		class: "1",
		fontColor: "#ffffff",
	},
	{
		type: "image",
		pre: "https://picsum.photos/seed/xtab-desert/400/225",
		url: "https://picsum.photos/seed/xtab-desert/1920/1080",
		class: "1",
		fontColor: "#ffffff",
	},
	{
		type: "image",
		pre: "https://picsum.photos/seed/xtab-snow/400/225",
		url: "https://picsum.photos/seed/xtab-snow/1920/1080",
		class: "1",
		fontColor: "#ffffff",
	},
];

export { wallpaperSource, wallpaperSourceClass };
