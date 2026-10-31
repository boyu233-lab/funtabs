import { PushpinFilled, SettingTwoTone } from "@ant-design/icons";
import { AutoComplete, Popover, Skeleton, Space, message } from "antd";
import { useEffect, useRef, useState } from "react";
import useDoubleClick from "use-double-click";
import { searchCity, subscribeWeather } from "../common/weatherService";
import cursorControl from "../common/cursorControl";
import "../module/clock.css";
import DeleteCard from "../module/deleteCard";
import ShowLabel from "../module/showLabel";
import "./localWeather.css";

const LocalWeather = (props) => {
	const {
		id,
		edit,
		num,
		linkList,
		gap,
		setLinkList,
		item,
		cardStyle,
		linkOpen,
		radius,
		widthNum,
		heightNum,
		click,
		fontColor,
		tabsActiveKey,
		setTabsActiveKey,
	} = props;
	const localCity = localStorage.getItem(`weather_${item.id}`);
	const [load, setLoad] = useState(true);
	const [weatherData, setWeatherData] = useState({
		city: "",
		temp: "",
		weather: "",
		aqi: "",
		weatherType: "",
		qualityLevel: "",
		windLevel: "",
		wind: "",
		icon: "",
		stale: false,
	});
	// 城市改为纯名称字符串，不再依赖作者服务返回的省/市级联数组
	const [cityName, setCityName] = useState(() => {
		if (!localCity) return "";
		try {
			const parsed = JSON.parse(localCity);
			return typeof parsed === "string" ? parsed : "";
		} catch (error) {
			return localCity || "";
		}
	});

	// 共享订阅：所有天气卡片共用一份数据与同一个轮询定时器，不再各自 setInterval
	useEffect(() => {
		const unsubscribe = subscribeWeather(cityName, (result) => {
			if (!result || !result.data) {
				return;
			}
			const data = result.data;
			setLoad(false);
			setWeatherData({
				city: data.city || cityName || "",
				temp: data.temp,
				weather: data.weather,
				aqi: "",
				qualityLevel: "",
				wind: data.wind,
				weatherType: data.weatherType,
				windLevel: data.windLevel,
				icon: data.icon,
				stale: !!result.stale,
			});
		});
		return () => unsubscribe();
	}, [cityName]);

	function changeLocal(e) {
		switch (e.key) {
			case `weather_${item.id}`: {
				try {
					const parsed = JSON.parse(e.newValue);
					setCityName(typeof parsed === "string" ? parsed : "");
				} catch (error) {
					setCityName(e.newValue || "");
				}
				break;
			}
			default:
				break;
		}
	}

	useEffect(() => {
		const __syncCtrl = new AbortController();
		window.addEventListener("setItemEvent", (e) => changeLocal(e), { signal: __syncCtrl.signal });
		return () => __syncCtrl.abort();
		// eslint-disable-next-line
	}, []);

	const [options, setOptions] = useState([]);

	// 按关键字搜索城市，走 Open-Meteo，不再依赖作者服务器下发的城市列表
	const onSearchCity = async (keyword) => {
		const list = await searchCity(keyword);
		setOptions(list);
	};

	const onChange = (value) => {
		setCityName(value || "");
		localStorage.setItem(`weather_${item.id}`, JSON.stringify(value || ""));
		if (value) {
			message.success("城市设置成功");
		}
	};

	function weatherSettings() {
		return (
			<AutoComplete
				value={cityName}
				options={options}
				onSearch={onSearchCity}
				onChange={onChange}
				placeholder="输入城市名，如 北京"
				allowClear
				style={{ width: 200 }}
			/>
		);
	}

	const showSettingsButton = () =>
		cardStyle === "onlyText" ? (
			<SettingTwoTone className="edit-button-style2" />
		) : (
			<SettingTwoTone className="edit-button-style" />
		);

	const showSettings = () =>
		edit === "" && (
			<>
				<DeleteCard
					linkList={linkList}
					id={id}
					item={item}
					num={num}
					setLinkList={setLinkList}
					cardStyle={cardStyle}
				/>
				<Popover title="选择城市" content={weatherSettings}>
					{showSettingsButton()}
				</Popover>
			</>
		);

	const {
		city,
		temp,
		weather,
		aqi,
		weatherType,
		qualityLevel,
		wind,
		windLevel,
		icon,
		stale,
	} = weatherData;

	// 背景按 WMO 天气代码判断：0/1 晴，45/48 雾，其余按多云/阴处理
	const showBackground = () => {
		if (cardStyle === "onlyText") return "none";
		const code = Number(weatherType);
		if (code === 0 || code === 1) {
			return "-webkit-linear-gradient(top, rgb(13, 104, 188), rgb(114, 173, 224))";
		}
		if (code === 45 || code === 48) {
			return "linear-gradient(rgb(24, 50, 89), rgb(52, 130, 186))";
		}
		return "-webkit-linear-gradient(top, rgb(72, 86, 99), rgb(161, 184, 202))";
	};


	const [fontSize, setFontSize] = useState(0);

	useEffect(() => {
		var size;
		if (cardStyle === "defaultCard") {
			size =
				2 * parseInt(heightNum) < parseInt(widthNum)
					? 2 * heightNum - 60
					: widthNum - 40;
		} else if (cardStyle === "onlyIconCard") {
			size =
				parseInt(heightNum) < parseInt(widthNum)
					? 2 * heightNum + parseInt(gap) - 85
					: 2 * widthNum + parseInt(gap) - 85;
		} else {
			size =
				parseInt(heightNum) < parseInt(widthNum)
					? 2 * heightNum + parseInt(gap) - 106
					: 2 * widthNum + parseInt(gap) - 106;
		}
		setFontSize(size);
	}, [widthNum, heightNum, gap, cardStyle]);

	const showWind = () =>
		widthNum > 68
			? `${weather}（${wind} ${windLevel}级）`
			: `${wind} ${windLevel}级`;

	const howToShow = () =>
		cardStyle === "onlyText" ? (
			<Space
				style={{
					width: "100%",
					height: "100%",
					alignItems: "center",
					justifyContent: "center",
					color: fontColor,
					fontWeight: "bold",
				}}
			>
				<PushpinFilled />
				<span>{city}</span>
				<span>{`${temp}°`}</span>
				<span>{weather}</span>
			</Space>
		) : (
			<div className="container2">
				<Skeleton
					active
					loading={load}
					title={false}
					paragraph={{
						rows: 3,
					}}
				>
					<Space>
						<PushpinFilled />
						<span>{city}</span>
						{stale ? (
							<span style={{ opacity: 0.75, fontSize: "12px" }}>
								离线缓存
							</span>
						) : null}
					</Space>
					{/* 用 emoji 图标代替墨迹天气的远程图片，离线也能显示 */}
					<span
						style={{
							position: "absolute",
							top: "10px",
							right: "12px",
							fontSize: "28px",
							lineHeight: "33px",
						}}
					>
						{load ? "" : icon || "🌡️"}
					</span>
					<p
						className="font-style"
						style={{
							fontSize: `${fontSize / 1.5}px`,
							lineHeight: `${fontSize / 1.5}px`,
							margin: "0px",
						}}
					>{`${temp}°`}</p>
					<span>
						{showWind()}
						<br />
						空气指数：{qualityLevel}&nbsp;{aqi}
					</span>
				</Skeleton>
			</div>
		);

	const doubleClickRef = useRef();

	function changeTabs(e) {
		if (linkList.length && linkList.length <= 1) {
			return;
		}
		const currentIndex = linkList.findIndex(
			(item) => item.key === tabsActiveKey
		);
		if (currentIndex === -1) {
			return;
		}
		const nextIndex = currentIndex + (e === "left" ? -1 : 1);
		const lastIndex = currentIndex - (e === "left" ? 1 : -1);
		if (linkList[lastIndex]) {
			setTabsActiveKey(linkList[lastIndex].key);
			localStorage.setItem("activeKey", linkList[lastIndex].key);
		} else if (linkList[nextIndex]) {
			setTabsActiveKey(linkList[nextIndex].key);
			localStorage.setItem("activeKey", linkList[nextIndex].key);
		} else {
			e === "left"
				? message.error("已经切换到最左侧分类")
				: message.error("已经切换到最右侧分类");
		}
	}

	useDoubleClick({
		onSingleClick: () => {
			if (edit === "" || click === 1) {
				return;
			} else {
				const w = document.body.clientWidth;
				if (w < 920) {
					window.open(`https://www.baidu.com/s?wd=${city}天气`, linkOpen);
				} else {
					window.open(
						`https://weathernew.pae.baidu.com/weathernew/pc?query=${city}天气&srcid=4982`,
						linkOpen
					);
				}
			}
		},
		ref: doubleClickRef,
		latency: 230,
	});

	return (
		<>
			<div
				ref={doubleClickRef}
				className="container"
				style={{
					background: showBackground(),
					color: "#fff",
					cursor: cursorControl(edit),
					fontWeight: "bold",
					borderRadius: radius,
					overflow: "hidden",
				}}
				onDoubleClick={(e) => {
					const x = e.clientX;
					const width = window.innerWidth;
					if (x <= width / 2) {
						changeTabs("left");
					} else {
						changeTabs("right");
					}
				}}
			>
				{showSettings()}
				{howToShow()}
			</div>
			<ShowLabel item={item} fontColor={fontColor} cardStyle={cardStyle} />
		</>
	);
};

export default LocalWeather;
