import {
	StyleProvider,
	legacyLogicalPropertiesTransformer,
} from "@ant-design/cssinjs";
import {
	CloudServerOutlined,
	DownOutlined,
	FileMarkdownOutlined,
	FormatPainterOutlined,
	PictureOutlined,
	PlusSquareOutlined,
	TableOutlined,
	UploadOutlined,
} from "@ant-design/icons";
import { animated, useSpring } from "@react-spring/web";
import Device from "@skillnull/device-js";
import {
	Dropdown,
	FloatButton,
	Tabs,
	message,
	notification,
} from "antd";
import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useDispatch, useSelector } from "react-redux";
import { useKeyPressEvent } from "react-use";
import useDoubleClick from "use-double-click";
import dispatchEventStorage from "../common/dispatchEventStroage";
import "../common/funtabs.css";
import "../index.css";
import {
	load as nasLoad,
	save as nasSave,
	retrySync as nasRetrySync,
	SYNC_EVENT,
} from "../common/nasStore";
import { getCachedWallpaper, getDailyWallpaper } from "../common/wallpaperService";
import { VERSION_LABEL, VERSION_TITLE } from "../common/version";
import { setDeviceType } from "../redux/slice/deviceType";
import AddNewCard from "./addNewCard";
import Bookmarks from "./bookmarks";
import ChangeWallpaper from "./changeWallpaper";
import Clock from "./clock";
import { funtabsData } from "./data";
import Header from "./header";
import LogoArea from "./logoArea";
import ObsidianPanel from "./obsidianPanel";
import SelfHostPanel from "./selfHostPanel";
import SearchTools from "./searchTools";
import Settings from "./settings";
import ShowList from "./showList";
import TabsManager from "./tabsManager";

const Home = () => {
	const dispatch = useDispatch();
	// 只解析一次：原先写在组件体里，每次渲染都会 JSON.parse 整份数据
	const [localData] = useState(() => {
		const raw = window.localStorage.getItem("funtabs");
		if (!raw) return null;
		try {
			return JSON.parse(raw);
		} catch (error) {
			return null;
		}
	});
	const getLocalStorageData = (key, defaultValue) => {
		const localValue = window.localStorage.getItem(key);
		try {
			return localValue ? JSON.parse(localValue) : defaultValue;
		} catch (error) {
			// 如果解析JSON失败，则返回原始值
			return localValue || defaultValue;
		}
	};

	// 初始化只解析一次并复用，原来同一份 JSON 被解析了 3 次
	const [initialData] = useState(() =>
		getLocalStorageData("funtabs", funtabsData)
	);

	const [newlinkList, setNewLinkList] = useState(() =>
		initialData && initialData.newData
			? initialData.newData.content
			: initialData.content
	);

	const [tabsActiveKey, setTabsActiveKey] = useState(() => {
		const localFuntabsData = localData ? localData?.newData : funtabsData;
		// 分类 key 为 0 是合法值，不能用 || 兜底，否则首个分类永远选不中
		const storedActiveKey = parseInt(localStorage.getItem("activeKey"), 10);
		const localActiveKey = Number.isNaN(storedActiveKey)
			? localFuntabsData.tabsActiveKey
			: storedActiveKey;
		try {
			const targetItem = newlinkList.find(
				(item) => item.key === localActiveKey
			);
			let targetKey;
			if (targetItem) {
				const targetItem2 =
					localFuntabsData.content.find(
						(item) => item.label === targetItem.label
					) || localFuntabsData.content[0];
				targetKey = targetItem2.key;
			} else {
				targetKey = localFuntabsData.content[0].key;
			}

			return targetKey;
		} catch (error) {
			return localFuntabsData.tabsActiveKey;
		}
	});

	const [model, setModel] = useState(() =>
		getLocalStorageData("model", funtabsData.model)
	);
	//定义卡片的宽度、高度、圆角、卡片样式、卡片间距大小
	const [widthNum, setWidthNum] = useState(() => {
		const localWidthNum =
			localData && localData.newData.widthNum
				? localData.newData.widthNum
				: funtabsData.widthNum;
		return parseInt(localWidthNum);
	});

	const [heightNum, setHeightNum] = useState(() => {
		const localHeightNum =
			localData && localData.newData.heightNum
				? localData.newData.heightNum
				: funtabsData.heightNum;
		return parseInt(localHeightNum);
	});

	const [radius, setRadius] = useState(() => {
		const localRadius =
			localData && localData.newData.radius
				? localData.newData.radius
				: funtabsData.radius;
		return parseInt(localRadius);
	});

	const [cardStyle, setCardStyle] = useState(() => {
		const localCardStyle =
			localData && localData.newData.cardStyle
				? localData.newData.cardStyle
				: funtabsData.cardStyle;
		return localCardStyle;
	});

	const [gap, setGap] = useState(() => {
		const localGap =
			localData && localData.newData.gap
				? localData.newData.gap
				: funtabsData.gap;
		return parseInt(localGap);
	});

	const [brightness, setBrightness] = useState(() => {
		const localBrightness = window.localStorage.getItem("brightness");
		return localBrightness ? parseInt(localBrightness) : 80;
	});

	const [blur, setBlur] = useState(() => {
		const localBlur = window.localStorage.getItem("blur");
		return localBlur ? parseInt(localBlur) : 0;
	});

	const [oldBrightness, setOldBrightness] = useState(() => brightness);

	const [oldBlur, setOldBlur] = useState(() => blur);
	//其他文本
	const [edit, setEdit] = useState("none");
	const [drag, setDrag] = useState(true);
	const [editText, setEditText] = useState("个性编辑");
	const [dropFilter, setDropFilter] = useState("");
	const [tabsVisibility, setTabsVisibility] = useState("");
	const backgroundImage = window.localStorage.getItem("backgroundImage");
	const [settingsAreaAnimation, setSettingsAreaAnimation] = useSpring(
		() => ({})
	);
	const tabs = useRef();
	const [num, setNum] = useState(0);
	const [url, setUrl] = useState(() => {
		if (
			backgroundImage === "null" ||
			backgroundImage === "undefined" ||
			backgroundImage === null
		) {
			return funtabsData.backgroundImage;
		} else {
			return `${backgroundImage}`;
		}
	});

	const [wallpaperType, setWallpaperType] = useState(() => {
		const localWallpaperType = window.localStorage.getItem("wallpaperType");
		return localWallpaperType ? localWallpaperType : "image";
	});

	// 每日壁纸开关：开启后自动拉取 Bing 每日图（经 NAS 代理），失败回退随机图源
	const [dailyWallpaper, setDailyWallpaper] = useState(
		() => window.localStorage.getItem("dailyWallpaper") === "1"
	);
	const [obsidianOpen, setObsidianOpen] = useState(false);
	const [selfHostOpen, setSelfHostOpen] = useState(false);

	const [timeArea, setTimeArea] = useState(() => {
		const timeAreaLocal = localStorage.getItem("timeArea");
		return timeAreaLocal ? timeAreaLocal : "time";
	});

	//列表动画
	const [linkListAnimation, api] = useSpring(() => ({}));

	const [gridWidth, setGridWidth] = useState("100%");
	const [gridWidthNum, setGridWidthNum] = useState(() =>
		localData && localData.newData.gridWidthNum
			? localData.newData.gridWidthNum
			: funtabsData.gridWidthNum
	);

	const [showClock, setShowClock] = useState(() => {
		const localShowClock = localStorage.getItem("showClock");
		return localShowClock === "" || localShowClock === "none"
			? localShowClock
			: "";
	});

	const [showSearch, setShowSearch] = useState(() => {
		const localShowSearch = localStorage.getItem("showSearch");
		return localShowSearch === "" || localShowSearch === "none"
			? localShowSearch
			: "";
	});

	const [linkOpen, setLinkOpen] = useState(() => {
		const localLinkOpen = localStorage.getItem("linkOpen");
		return localLinkOpen === "_self" || localLinkOpen === "_blank"
			? localLinkOpen
			: "_blank";
	});

	const [fontColor, setFontColor] = useState(() => {
		const localFontColor = localStorage.getItem("fontColor");
		return localFontColor ? localFontColor : "#ffffff";
	});

	const [paddingTop, setPaddingTop] = useState(() => {
		const localPaddingTop = window.localStorage.getItem("paddingTop");
		return localPaddingTop ? parseInt(localPaddingTop) : 30;
	});

	const [showSettings, setShowSettings] = useState(() => {
		const localShowSettings = window.localStorage.getItem("showSettings");
		return localShowSettings ? localShowSettings : "show";
	});

	const [clockAreaHeight, setClockAreaHeight] = useState(() => {
		const localClockAreaHeight = window.localStorage.getItem("clockAreaHeight");
		return localClockAreaHeight ? parseInt(localClockAreaHeight) : 188;
	});

	const deviceType = useSelector((state) => state.deviceType.type);
	const autoCloudSync = useSelector((state) => state.cloudSync.autoCloudSync);

	const [modelAnimation, modelAnimationApi] = useSpring(() => ({
		y:
			document.documentElement.clientWidth > 650 && model === "none"
				? window.innerHeight * 0.1
				: 0,
	}));

	//网格布局样式信息
	const gridStyle = {
		display: "grid",
		gridTemplateColumns:
			deviceType === "PC"
				? `repeat(auto-fill, ${widthNum}px)`
				: `repeat(auto-fill, minmax(${widthNum}px,1fr))`,
		justifyContent: "center",
		columnGap: `${gap}px`,
		rowGap: `${gap}px`,
		gridAutoFlow: "dense",
		gridAutoRows: `${heightNum}px`,
		maxWidth: "100%",
		padding: "8px",
		width: `${newWidth()}px`,
	};

	// 通知弹窗已移除，保留占位避免改动 JSX
	const [, contextHolder] = notification.useNotification();

	// NAS 同步状态："synced" 已同步 | "offline" 离线用缓存 | "pending" 待回写 | "conflict" 冲突
	const [syncState, setSyncState] = useState("synced");
	const updatedAtRef = useRef(0);

	// 启动时以 NAS 数据为真相源覆盖本地缓存
	useEffect(() => {
		let alive = true;
		nasLoad().then((res) => {
			if (!alive || !res.data) return;
			updatedAtRef.current = res.updatedAt || 0;
			setSyncState(res.offline ? "offline" : "synced");
			const remote = res.data;
			if (Array.isArray(remote.content) && remote.content.length) {
				setNewLinkList(remote.content);
				window.localStorage.setItem(
					"funtabs",
					JSON.stringify({ newData: remote })
				);
			}
			if (remote.widthNum) setWidthNum(parseInt(remote.widthNum));
			if (remote.heightNum) setHeightNum(parseInt(remote.heightNum));
			if (remote.radius !== undefined) setRadius(parseInt(remote.radius));
			if (remote.cardStyle) setCardStyle(remote.cardStyle);
			if (remote.gap !== undefined) setGap(parseInt(remote.gap));
			if (remote.gridWidthNum)
				setGridWidthNum(parseInt(remote.gridWidthNum));
		});
		return () => {
			alive = false;
		};
		// eslint-disable-next-line
	}, []);

	useEffect(() => {
		const onSync = (e) => {
			const detail = e.detail || {};
			if (detail.status === "synced") {
				setSyncState("synced");
				if (detail.updatedAt) updatedAtRef.current = detail.updatedAt;
			} else if (detail.status === "offline") {
				setSyncState("offline");
			} else if (detail.status === "pending") {
				setSyncState("pending");
			} else if (detail.status === "conflict") {
				setSyncState("conflict");
			}
		};
		window.addEventListener(SYNC_EVENT, onSync);
		return () => window.removeEventListener(SYNC_EVENT, onSync);
	}, []);

	// 每日壁纸：只使用网络图片 URL，不再把 base64 写进 localStorage
	useEffect(() => {
		if (!dailyWallpaper) {
			return;
		}
		const cached = getCachedWallpaper();
		if (cached && cached.url) {
			setUrl(cached.url);
		}
		getDailyWallpaper().then((res) => {
			if (res && res.url) {
				setUrl(res.url);
			}
		});
	}, [dailyWallpaper]);

	function newWidth() {
		return parseInt(gridWidthNum) < parseInt(gridWidth)
			? `${gridWidthNum}`
			: `${gridWidth}`;
	}

	//判断标签页是否显示
	const tabsVis = () => {
		newlinkList.length === 1
			? setTabsVisibility("none")
			: setTabsVisibility("");
	};

	function editFunction(e) {
		if (edit === "none") {
			setEdit("");
			setDrag(false);
			setDropFilter("blur(5px)");
			setEditText("保存编辑");
			setSettingsAreaAnimation.start({
				from: {
					y: -20,
					opacity: 0,
				},
				to: {
					y: 0,
					opacity: 1,
				},
			});
		} else {
			if (e === 0) {
				setEdit("none");
				setDrag(true);
				setDropFilter("");
				saveData();
				const token = window.localStorage.getItem("token");
				if (token && autoCloudSync === true) {
					message.success("保存成功");
				} else {
					message.success("本地保存成功");
				}
			} else {
				setEdit("none");
				setDrag(true);
				setDropFilter("");
				message.success("取消编辑");
				cancelEdit();
			}
			setEditText("个性编辑");
		}
	}

	function cancelEdit() {
		window.sessionStorage.clear();
		const localFuntabsData =
			JSON.parse(localStorage.getItem("funtabs"))?.newData || funtabsData;
		// 同上：key 为 0 时不能用 || 兜底
		const storedActiveKey = parseInt(localStorage.getItem("activeKey"), 10);
		const localActiveKey = Number.isNaN(storedActiveKey)
			? localFuntabsData.tabsActiveKey
			: storedActiveKey;
		window.sessionStorage.removeItem("localHotEventColor");

		setNewLinkList(localFuntabsData.content);
		setWidthNum(localFuntabsData.widthNum);
		setHeightNum(localFuntabsData.heightNum);
		setCardStyle(localFuntabsData.cardStyle);
		setGridWidthNum(localFuntabsData.gridWidthNum);
		setGap(localFuntabsData.gap);
		setRadius(localFuntabsData.radius);
		setTabsVisibility(localFuntabsData.content.length > 1 ? "" : "none");

		try {
			const targetItem = newlinkList.find(
				(item) => item.key === localActiveKey
			);
			let targetKey;
			if (targetItem) {
				const targetItem2 =
					localFuntabsData.content.find(
						(item) => item.label === targetItem.label
					) || localFuntabsData.content[0];
				targetKey = targetItem2.key;
			} else {
				targetKey = localFuntabsData.content[0].key;
			}

			setTabsActiveKey(targetKey);
			window.localStorage.setItem("activeKey", targetKey);
		} catch (error) {
			setTabsActiveKey(localFuntabsData.tabsActiveKey);
			window.localStorage.setItem("activeKey", localFuntabsData.tabsActiveKey);
		}
	}

	function saveData() {
		// 读取最新快照而非挂载时的旧数据，避免覆盖掉其他模块的写入
		const fresh = window.localStorage.getItem("funtabs");
		let parsed = null;
		try {
			parsed = fresh ? JSON.parse(fresh) : null;
		} catch (e) {
			parsed = null;
		}
		const newData =
			parsed && parsed.newData ? parsed.newData : { ...funtabsData };
		newData.content = newlinkList;
		newData.gap = gap;
		newData.widthNum = widthNum;
		newData.heightNum = heightNum;
		newData.cardStyle = cardStyle;
		newData.radius = radius;
		newData.gridWidthNum = gridWidthNum;
		window.localStorage.setItem("funtabs", JSON.stringify({ newData }));

		const localHotEventColor =
			window.sessionStorage.getItem("localHotEventColor");
		if (localHotEventColor) {
			window.localStorage.setItem("localHotEventColor", localHotEventColor);
			window.sessionStorage.removeItem("localHotEventColor");
		}
		window.localStorage.setItem("saveTime", Date.now());

		// 回写 NAS（异步，失败时数据仍在本地缓存，联网后由 retrySync 补写）
		nasSave(newData, updatedAtRef.current).then((res) => {
			if (res.ok && res.updatedAt) {
				updatedAtRef.current = res.updatedAt;
			} else if (res.conflict) {
				setSyncState("conflict");
				message.warning(
					"NAS 上的数据比本地新，本地编辑已暂存在浏览器，可在设置中选择覆盖"
				);
			}
		});
	}

	function saveActiveKey(e) {
		window.localStorage.setItem("activeKey", e);
	}

	const memoizedChangeWidth = useMemo(() => {
		const cache = {};

		return (e) => {
			const index = newlinkList.findIndex((item) => item.key === e);
			setNum(index);
			tabs.current.slickGoTo(index, true);

			if (cache[e]) {
				// 从缓存中获取宽度
				setGridWidth(cache[e]);
			} else {
				const gridContainerId = `#sortable${e}`;
				const classSelector = "div[class^='grid-item']";
				let classNum = 0;

				const classList = document.querySelectorAll(
					`${gridContainerId} > ${classSelector}`
				);
				const l = classList.length;

				for (let j = 0; j < l; j++) {
					const classWidth = parseInt(
						classList[j].className.match(/\d+/)[0].slice(-1)
					);
					classNum += classWidth;
				}

				const result = widthNum * classNum + gap * classNum - gap;
				setGridWidth(result);

				// 将宽度存储到缓存中
				cache[e] = result;
			}
		};
		// eslint-disable-next-line
	}, [newlinkList]);

	useEffect(() => {
		tabsVis();
		memoizedChangeWidth(tabsActiveKey);
		// eslint-disable-next-line
	}, [newlinkList, tabsActiveKey, cardStyle]);

	const changeTabsAnimation = useCallback(() => {
		api.start({
			from: {
				y: 20,
				opacity: 0,
				display: "none",
			},
			to: [
				{
					y: 19.99,
					opacity: 0,
					display: "",
				},
				{
					y: 0,
					opacity: 1,
					display: "",
				},
			],
			config: {
				duration: 150,
			},
		});
	}, [api]);

	useEffect(() => {
		changeTabsAnimation();
		return () => api.stop();
		// eslint-disable-next-line
	}, [tabsActiveKey]);

	useEffect(() => {
		const __syncCtrl = new AbortController();
		dispatchEventStorage();
		window.addEventListener("setItemEvent", function (e) {
			switch (e.key) {
				case "funtabs": {
					if (e.newValue && JSON.parse(e.newValue).newData) {
						setNewLinkList(JSON.parse(e.newValue).newData.content);
						setWidthNum(parseInt(JSON.parse(e.newValue).newData.widthNum));
						setHeightNum(parseInt(JSON.parse(e.newValue).newData.heightNum));
						setRadius(parseInt(JSON.parse(e.newValue).newData.radius));
						setGridWidthNum(
							parseInt(JSON.parse(e.newValue).newData.gridWidthNum)
						);
						setGap(parseInt(JSON.parse(e.newValue).newData.gap));
						setCardStyle(JSON.parse(e.newValue).newData.cardStyle);
						const localActiveKey = parseInt(
							localStorage.getItem("activeKey")
								? localStorage.getItem("activeKey")
								: JSON.parse(e.newValue).newData.tabsActiveKey
						);
						try {
							const targetItem = JSON.parse(e.newValue).newData.content.find(
								(item) => item.key === localActiveKey
							);
							let targetKey;
							if (!targetItem) {
								targetKey = parseInt(
									JSON.parse(e.newValue).newData.content[0].key
								);
								setTabsActiveKey(targetKey);
								window.localStorage.setItem("activeKey", targetKey);
							} else {
								setTabsActiveKey(localActiveKey);
								window.localStorage.setItem("activeKey", localActiveKey);
							}
						} catch (error) {
							console.log(error);
						}
					}
					break;
				}
				case "showClock":
					setShowClock(e.newValue);
					break;
				case "showSearch":
					setShowSearch(e.newValue);
					break;
				case "linkOpen":
					setLinkOpen(e.newValue);
					break;
				case "model":
					setModel(e.newValue);
					break;
				case "backgroundImage":
					const image = new Image();
					image.src = e.newValue;
					image.onload = function () {
						setUrl(e.newValue);
					};
					break;
				// case 'activeKey':
				//     setTabsActiveKey(parseInt(e.newValue))
				//     break
				case "paddingTop":
					setPaddingTop(parseInt(e.newValue));
					break;
				case "fontColor":
					setFontColor(e.newValue);
					break;
				case "wallpaperType":
					setWallpaperType(e.newValue);
					break;
				case "dailyWallpaper":
					setDailyWallpaper(e.newValue === "1");
					break;
				case "blur":
					setBlur(parseInt(e.newValue));
					setOldBlur(parseInt(e.newValue));
					break;
				case "brightness":
					setBrightness(parseInt(e.newValue));
					setOldBrightness(parseInt(e.newValue));
					break;
				case "timeArea":
					setTimeArea(e.newValue);
					break;
				case "clockAreaHeight":
					setClockAreaHeight(parseInt(e.newValue));
					break;
				case "showSettings":
					setShowSettings(e.newValue);
					break;
				default:
					break;
			}
		}, { signal: __syncCtrl.signal });
		if (window.location.protocol === "chrome-extension:") {
			window.addEventListener("storage", function (e) {
				switch (e.key) {
					case "funtabs": {
						if (e.newValue && JSON.parse(e.newValue).newData) {
							setNewLinkList(JSON.parse(e.newValue).newData.content);
							setWidthNum(parseInt(JSON.parse(e.newValue).newData.widthNum));
							setHeightNum(parseInt(JSON.parse(e.newValue).newData.heightNum));
							setRadius(parseInt(JSON.parse(e.newValue).newData.radius));
							setGridWidthNum(
								parseInt(JSON.parse(e.newValue).newData.gridWidthNum)
							);
							setGap(parseInt(JSON.parse(e.newValue).newData.gap));
							setCardStyle(JSON.parse(e.newValue).newData.cardStyle);
							const localActiveKey = parseInt(
								localStorage.getItem("activeKey")
									? localStorage.getItem("activeKey")
									: JSON.parse(e.newValue).newData.tabsActiveKey
							);
							try {
								const targetItem = JSON.parse(e.newValue).newData.content.find(
									(item) => item.key === localActiveKey
								);
								let targetKey;
								if (!targetItem) {
									targetKey = parseInt(
										JSON.parse(e.newValue).newData.content[0].key
									);
									setTabsActiveKey(targetKey);
									window.localStorage.setItem("activeKey", targetKey);
								} else {
									setTabsActiveKey(localActiveKey);
									window.localStorage.setItem("activeKey", localActiveKey);
								}
							} catch (error) {
								console.log(error);
							}
						}
						break;
					}
					default:
						break;
				}
			}, { signal: __syncCtrl.signal });
		}
		return () => __syncCtrl.abort();
		// eslint-disable-next-line
	}, []);

	useEffect(() => {
		Device.Info({
			info: ["deviceType"],
		}).then((data) => {
			dispatch(setDeviceType(data.deviceType));
		});
		//eslint-disable-next-line
	}, []);

	const items = [
		{
			label: editText,
			key: "1",
			icon: <FormatPainterOutlined />,
		},
		{
			label: (
				<AddNewCard
					model={model}
					linkList={newlinkList}
					num={num}
					setLinkList={setNewLinkList}
					funtabsData={funtabsData}
					tabsActiveKey={tabsActiveKey}
					setTabsActiveKey={setTabsActiveKey}
					type={1}
					edit={edit}
					cardStyle={cardStyle}
				/>
			),
			key: "2",
			icon: <PlusSquareOutlined />,
		},
		{
			label: (
				<TabsManager
					tabs={tabs}
					linkList={newlinkList}
					setLinkList={setNewLinkList}
					setTabsVisibility={setTabsVisibility}
					tabsActiveKey={tabsActiveKey}
					setTabsActiveKey={setTabsActiveKey}
					localData={localData}
					type={1}
					edit={edit}
				/>
			),
			key: "3",
			icon: <TableOutlined />,
		},
		{
			label: (
				<ChangeWallpaper
					url={url}
					setUrl={setUrl}
					brightness={brightness}
					setBrightness={setBrightness}
					blur={blur}
					setBlur={setBlur}
					oldBlur={oldBlur}
					oldBrightness={oldBrightness}
					setOldBlur={setOldBlur}
					setOldBrightness={setOldBrightness}
					type={1}
					fontColor={fontColor}
					setFontColor={setFontColor}
					wallpaperType={wallpaperType}
					setWallpaperType={setWallpaperType}
					linkList={newlinkList}
					setLinkList={setNewLinkList}
					timeArea={timeArea}
					setTimeArea={setTimeArea}
					clockAreaHeight={clockAreaHeight}
					setClockAreaHeight={setClockAreaHeight}
				/>
			),
			key: "4",
			icon: <PictureOutlined />,
		},
		{
			label: (
				<Bookmarks
					linkList={newlinkList}
					num={num}
					tabsActiveKey={tabsActiveKey}
					setLinkList={setNewLinkList}
					setTabsActiveKey={setTabsActiveKey}
					type={1}
					edit={edit}
					cardStyle={cardStyle}
				/>
			),
			key: "5",
			icon: <UploadOutlined />,
		},
	];

	function toggleDailyWallpaper() {
		const next = !dailyWallpaper;
		setDailyWallpaper(next);
		window.localStorage.setItem("dailyWallpaper", next ? "1" : "0");
		if (next) {
			getDailyWallpaper({ force: true }).then((res) => {
				if (res && res.url) {
					setUrl(res.url);
				}
			});
		} else {
			const local = window.localStorage.getItem("backgroundImage");
			setUrl(
				local && local !== "null" && local !== "undefined"
					? `${local}`
					: funtabsData.backgroundImage
			);
		}
	}

	function showWallpaper() {
		const videoStyle = {
			filter: `brightness(${brightness}%)`,
		};

		return wallpaperType === "video" && deviceType === "PC" ? (
			<video
				className={`background`}
				autoPlay
				loop
				muted
				src={`${url}`}
				style={{ ...videoStyle, objectFit: "cover" }}
			/>
		) : wallpaperType === "color" ? (
			<div
				className={`background`}
				style={{
					backgroundColor: `${url}`,
					...videoStyle,
				}}
			/>
		) : (
			<>
				<div
					className={`background`}
					style={{
						filter: `brightness(${brightness}%)`,
						backgroundImage: `url(${url})`,
					}}
					alt=""
				/>
			</>
		);
	}

	function showTimeArea() {
		if (timeArea === "time" && showClock === "") {
			return (
				<Clock
					model={model}
					setModel={setModel}
					fontColor={fontColor}
					clockAreaHeight={clockAreaHeight}
					modelAnimationApi={modelAnimationApi}
					api={api}
				/>
			);
		} else if (timeArea === "logo" && showClock === "") {
			return (
				<LogoArea
					model={model}
					setModel={setModel}
					clockAreaHeight={clockAreaHeight}
					modelAnimationApi={modelAnimationApi}
					api={api}
				/>
			);
		}
	}

	function changeTabs(e) {
		if (newlinkList.length && newlinkList.length <= 1) {
			return;
		}
		const currentIndex = newlinkList.findIndex(
			(item) => item.key === tabsActiveKey
		);
		if (currentIndex === -1) {
			return;
		}
		const nextIndex = currentIndex + (e === "left" ? -1 : 1);
		const lastIndex = currentIndex - (e === "left" ? 1 : -1);
		if (newlinkList[lastIndex]) {
			setTabsActiveKey(newlinkList[lastIndex].key);
			localStorage.setItem("activeKey", newlinkList[lastIndex].key);
		} else if (newlinkList[nextIndex]) {
			setTabsActiveKey(newlinkList[nextIndex].key);
			localStorage.setItem("activeKey", newlinkList[nextIndex].key);
		} else {
			e === "left"
				? message.error("已经切换到最左侧分类")
				: message.error("已经切换到最右侧分类");
		}
	}

	const doubleClickRef = useRef();

	useDoubleClick({
		onDoubleClick: (e) => {
			const x = e.clientX;
			const width = window.innerWidth;
			if (x <= width / 2) {
				changeTabs("left");
			} else {
				changeTabs("right");
			}
		},
		ref: doubleClickRef,
		latency: 230,
	});

	useKeyPressEvent("Tab", (e) => {
		if (e.target.nodeName === "BODY") {
			e.preventDefault();
			setTimeout(() => {
				return document.getElementById("search-input")
					? document.getElementById("search-input").focus()
					: null;
			}, 0);
		}
	});

	return (
		<StyleProvider
			transformers={[legacyLogicalPropertiesTransformer]}
			hashPriority="high"
		>
			{contextHolder}
			<Dropdown
				menu={{
					items: items,
					onClick: (e) => {
						// eslint-disable-next-line
						switch (e.key) {
							case "1": {
								editFunction(0);
								break;
							}
							default:
								break;
						}
					},
				}}
				trigger={["contextMenu"]}
			>
				<div className="font-style">
					<div className="content" style={{ paddingTop: `${paddingTop}px` }}>
						{showWallpaper()}
						<div
							className="background"
							style={{
								WebkitBackdropFilter: `blur(${(blur / 100) * 20}px)`,
								backdropFilter: `blur(${(blur / 100) * 20}px)`,
							}}
							ref={doubleClickRef}
						/>
						<Header
							model={model}
							editFunction={editFunction}
							editText={editText}
							drag={drag}
							setModel={setModel}
							showClock={showClock}
							showSearch={showSearch}
							linkOpen={linkOpen}
							setLinkOpen={setLinkOpen}
							setShowClock={setShowClock}
							setShowSearch={setShowSearch}
							fontColor={fontColor}
							paddingTop={paddingTop}
							setPaddingTop={setPaddingTop}
							showSettings={showSettings}
							setShowSettings={setShowSettings}
							linkList={newlinkList}
							modelAnimationApi={modelAnimationApi}
							setUrl={setUrl}
							setWallpaperType={setWallpaperType}
							api={api}
						/>
						<animated.div
							style={{
								...modelAnimation,
								minHeight: `calc(100vh - 30px - ${paddingTop}px)`,
							}}
						>
							<div style={{ pointerEvents: edit === "" ? "none" : "all" }}>
								{showTimeArea()}
								<SearchTools
									showSearch={showSearch}
									linkOpen={linkOpen}
									linkList={newlinkList}
									edit={edit}
								/>
							</div>
							<div
								className="gridArea"
								style={{
									pointerEvents: "none",
								}}
							>
								<div
									key="showList"
									style={{
										width: "100%",
										display: model,
										marginTop: "-32px",
									}}
								>
									<div
										style={{
											minHeight: "20px",
										}}
									>
										<Tabs
											id="option_tabs"
											items={newlinkList}
											activeKey={tabsActiveKey}
											tabBarStyle={{
												color: fontColor,
												fontWeight: "bold",
												display: tabsVisibility,
											}}
											onDragOver={(e) => {
												//鼠标拖拽切换分类
												const id = e.target.id;
												if (
													id.includes("option_tabs-tab-") === true &&
													drag === false
												) {
													const dropTo = parseInt(id.substring(16));
													setTabsActiveKey(dropTo);
													saveActiveKey(dropTo);
												}
											}}
											moreIcon={
												<DownOutlined
													style={{
														fontSize: "1rem",
														color: "#ffffff",
														paddingTop: "5px",
													}}
												/>
											}
											onChange={(e) => {
												e = parseInt(e);
												setTabsActiveKey(e);
												saveActiveKey(e);
											}}
										/>
									</div>
									<animated.div style={linkListAnimation}>
										<ShowList
											cardStyle={cardStyle}
											tabs={tabs}
											num={num}
											gap={gap}
											newlinkList={newlinkList}
											setNewLinkList={setNewLinkList}
											gridStyle={gridStyle}
											drag={drag}
											edit={edit}
											radius={radius}
											widthNum={widthNum}
											gridWidthNum={gridWidthNum}
											heightNum={heightNum}
											tabsActiveKey={tabsActiveKey}
											setTabsActiveKey={setTabsActiveKey}
											linkOpen={linkOpen}
											fontColor={fontColor}
											editFunction={editFunction}
										/>
									</animated.div>
								</div>
							</div>
						</animated.div>
						{/* eslint-disable-next-line */}
						<animated.div
							style={{
								backgroundColor: "rgb(0 0 0 / 50%)",
								backdropFilter: dropFilter,
								WebkitBackdropFilter: dropFilter,
								top: "0px",
								position: "fixed",
								zIndex: 20,
								...settingsAreaAnimation,
							}}
						>
							<Settings
								tabs={tabs}
								model={model}
								num={num}
								setNum={setNum}
								widthNum={widthNum}
								setWidthNum={setWidthNum}
								heightNum={heightNum}
								setHeightNum={setHeightNum}
								gridWidthNum={gridWidthNum}
								setGridWidthNum={setGridWidthNum}
								linkList={newlinkList}
								setLinkList={setNewLinkList}
								edit={edit}
								editFunction={editFunction}
								radius={radius}
								setRadius={setRadius}
								cardStyle={cardStyle}
								setCardStyle={setCardStyle}
								gap={gap}
								setGap={setGap}
								tabsActiveKey={tabsActiveKey}
								setTabsActiveKey={setTabsActiveKey}
								funtabsData={funtabsData}
								setTabsVisibility={setTabsVisibility}
								localData={localData}
								url={url}
								setUrl={setUrl}
								brightness={brightness}
								setBrightness={setBrightness}
								blur={blur}
								setBlur={setBlur}
								oldBlur={oldBlur}
								setOldBlur={setOldBlur}
								setOldBrightness={setOldBrightness}
								oldBrightness={oldBrightness}
								setGridWidth={setGridWidth}
								fontColor={fontColor}
								setFontColor={setFontColor}
								wallpaperType={wallpaperType}
								setWallpaperType={setWallpaperType}
								timeArea={timeArea}
								setTimeArea={setTimeArea}
								clockAreaHeight={clockAreaHeight}
								setClockAreaHeight={setClockAreaHeight}
							/>
						</animated.div>
					</div>
					{syncState !== "synced" ? (
					<div
						onClick={() => {
							if (syncState === "pending" || syncState === "offline") {
								nasRetrySync();
							}
						}}
						style={{
							position: "fixed",
							left: 16,
							bottom: 16,
							zIndex: 30,
							padding: "4px 10px",
							borderRadius: 12,
							fontSize: 12,
							color: "#fff",
							backgroundColor:
								syncState === "conflict"
									? "#d4380d"
									: syncState === "pending"
									? "#d46b08"
									: "#595959",
							cursor:
								syncState === "pending" || syncState === "offline"
									? "pointer"
									: "default",
						}}
					>
						{syncState === "offline"
							? "离线模式 · 数据暂存在浏览器"
							: syncState === "pending"
							? "待同步到 NAS · 点击重试"
							: "数据冲突 · 本地与 NAS 不一致"}
					</div>
				) : null}
				{/* 版本角标：用于确认当前访问的是哪个构建版本 */}
				<div
					title={VERSION_TITLE}
					style={{
						position: "fixed",
						right: 76,
						bottom: 10,
						zIndex: 30,
						fontSize: 11,
						letterSpacing: 0.3,
						color: "#fff",
						opacity: 0.45,
						pointerEvents: "auto",
						userSelect: "none",
						textShadow: "0 1px 2px rgb(0 0 0 / 60%)",
					}}
				>
					{VERSION_LABEL}
				</div>
				<FloatButton.Group shape="circle" style={{ right: 24 }}>
						<FloatButton.BackTop duration={0} />
						<FloatButton
							icon={<PictureOutlined />}
							tooltip={dailyWallpaper ? "关闭每日壁纸" : "开启每日壁纸"}
							onClick={toggleDailyWallpaper}
						/>
						<FloatButton
							icon={<FileMarkdownOutlined />}
							tooltip="Obsidian"
							onClick={() => setObsidianOpen(true)}
						/>
						<FloatButton
							icon={<CloudServerOutlined />}
							tooltip="自托管设置"
							onClick={() => setSelfHostOpen(true)}
						/>
					</FloatButton.Group>
				</div>
			</Dropdown>
			<ObsidianPanel
				open={obsidianOpen}
				onClose={() => setObsidianOpen(false)}
			/>
			<SelfHostPanel
				open={selfHostOpen}
				onClose={() => setSelfHostOpen(false)}
			/>
		</StyleProvider>
	);
};

export { Home };
