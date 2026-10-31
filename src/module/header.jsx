import {
	AppstoreFilled,
	FormatPainterFilled,
	GithubFilled,
	HomeFilled,
	InteractionFilled,
	RedoOutlined,
	WarningFilled,
} from "@ant-design/icons";
import {
	Button,
	Col,
	Dropdown,
	Input,
	InputNumber,
	Row,
	Space,
	Switch,
} from "antd";
import { useEffect, useState } from "react";
import { useWindowSize } from "react-use";

import "../common/funtabs.css";
import "../index.css";
import BackupData from "./backupData";
import ResetData from "./resetData";

const Header = (props) => {
	const {
		model,
		editFunction,
		editText,
		drag,
		setModel,
		api,
		fontColor,
		paddingTop,
		setPaddingTop,
		showClock,
		setShowClock,
		showSearch,
		setShowSearch,
		linkOpen,
		setLinkOpen,
		showSettings,
		setShowSettings,
		modelAnimationApi,
		setUrl,
		setWallpaperType,
	} = props;
	const [title, setTitle] = useState(() => {
		return document.title;
	});
	const { width } = useWindowSize();

	useEffect(() => {
		const __syncCtrl = new AbortController();
		window.addEventListener("setItemEvent", function (e) {
			switch (e.key) {
				case "webTitle":
					document.title = e.newValue;
					setTitle(e.newValue);
					break;
				default:
					break;
			}
		}, { signal: __syncCtrl.signal });
		return () => __syncCtrl.abort();
		// eslint-disable-next-line
	}, []);

	const moreMenu = [
		{
			key: "BackupRecovery",
			label: <BackupData />,
			icon: <InteractionFilled />,
		},
		{
			key: "recovery",
			label: <ResetData />,
			icon: <WarningFilled />,
		},
		{
			key: "home",
			label: (
				<a
					href="https://github.com/boyu233-lab/funtabs"
					target={linkOpen}
					rel="noreferrer"
				>
					Xtab 项目
				</a>
			),
			icon: <HomeFilled />,
		},
		{
			key: "github",
			label: (
				<a
					href="https://github.com/dengxiwang/funtabs"
					target={linkOpen}
					rel="noreferrer"
				>
					上游 funtabs
				</a>
			),
			icon: <GithubFilled />,
		},
	];

	function showOthers() {
		return (
			<>
				<div>
					<Input
						addonBefore={"页面标题"}
						autoComplete="off"
						addonAfter={
							<RedoOutlined
								onClick={() => {
									setTitle("Xtab");
									document.title = "Xtab";
									window.localStorage.setItem("webTitle", "Xtab");
								}}
							/>
						}
						value={title}
						onChange={(e) => {
							const value = e.target.value;
							setTitle(value);
							document.title = value;
							window.localStorage.setItem("webTitle", value);
						}}
						maxLength={20}
						style={{
							width: "calc(100%)",
							marginBottom: "8px",
						}}
						allowClear
					/>
				</div>
				<Row style={{ margin: "8px 0px 12px 0px", alignItems: "center" }}>
					<Col flex="1">
						<InputNumber
							value={paddingTop}
							addonBefore="顶部高度"
							autoComplete="off"
							addonAfter="px像素"
							onChange={(e) => {
								if (e) {
									setPaddingTop(e);
									window.localStorage.setItem("paddingTop", e);
								}
							}}
						/>
					</Col>
					<Col>
						<Button
							style={{ padding: "0px 10px", marginLeft: "2px" }}
							onClick={() => {
								setPaddingTop(30);
								window.localStorage.setItem("paddingTop", 30);
							}}
						>
							<RedoOutlined />
						</Button>
					</Col>
				</Row>
				<Space wrap className="moreSettings">
					<div>
						简约模式：
						<Switch
							checkedChildren="打开"
							unCheckedChildren="关闭"
							defaultChecked={() => {
								if (model === "") {
									return false;
								} else {
									return true;
								}
							}}
							disabled={!drag}
							onChange={() => {
								const deviceWidth = document.documentElement.clientWidth;
								const moveNum = window.innerHeight * 0.1;
								if (model === "") {
									setModel("none");
									localStorage.setItem("model", "none");
									if (deviceWidth > 650) {
										modelAnimationApi.start({
											from: {
												y: 0,
											},
											to: {
												y: moveNum,
											},
										});
									}
								} else {
									setModel("");
									localStorage.setItem("model", "");
									modelAnimationApi.start({
										from: {
											y: moveNum,
										},
										to: {
											y: 0,
										},
									});
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
								}
							}}
						/>
					</div>
					<div>
						页面跳转：
						<Switch
							checkedChildren="页内"
							unCheckedChildren="页外"
							onChange={(e) => {
								if (e === false) {
									setLinkOpen("_blank");
									window.localStorage.setItem("linkOpen", "_blank");
								} else {
									setLinkOpen("_self");
									window.localStorage.setItem("linkOpen", "_self");
								}
							}}
							defaultChecked={() => {
								if (linkOpen === "_self") {
									return true;
								} else {
									return false;
								}
							}}
						/>
					</div>
					<div>
						时钟/LOGO：
						<Switch
							checkedChildren="开启"
							unCheckedChildren="关闭"
							onChange={(e) => {
								if (e === false) {
									setShowClock("none");
									localStorage.setItem("showClock", "none");
								} else {
									setShowClock("");
									localStorage.setItem("showClock", "");
								}
							}}
							defaultChecked={() => {
								if (showClock === "") {
									return true;
								} else {
									return false;
								}
							}}
						/>
					</div>
					<div>
						搜索框：
						<Switch
							checkedChildren="开启"
							unCheckedChildren="关闭"
							onChange={(e) => {
								if (e === false) {
									setShowSearch("none");
									localStorage.setItem("showSearch", "none");
								} else {
									setShowSearch("");
									localStorage.setItem("showSearch", "");
								}
							}}
							defaultChecked={() => {
								if (showSearch === "") {
									return true;
								} else {
									return false;
								}
							}}
						/>
					</div>
					<div>
						顶部菜单：
						<Switch
							checkedChildren="常驻"
							unCheckedChildren="隐藏"
							onChange={(e) => {
								if (e === false) {
									setShowSettings("autoHidden");
									localStorage.setItem("showSettings", "autoHidden");
								} else {
									setShowSettings("show");
									localStorage.setItem("showSettings", "show");
								}
							}}
							defaultChecked={() => {
								if (showSettings === "show") {
									return true;
								} else {
									return false;
								}
							}}
						/>
					</div>
				</Space>
			</>
		);
	}

	function getRandomWallpaper() {
		// 改用 picsum 随机图，不再请求原作者服务器
		const res = `https://picsum.photos/1920/1080?random=${Date.now()}`;
		const image = new Image();
		image.src = res;
		image.onload = function () {
			setUrl(res);
			setWallpaperType("image");
			localStorage.setItem("backgroundImage", res);
		};
	}

	return (
		<>
			{/* 设置按钮 */}
			<div
				className={
					showSettings === "show" ? "settings" : "settings-auto-hidden"
				}
				id="header"
				style={{
					zIndex: "11",
					justifyContent: width < 480 ? "flex-end" : "space-between",
					boxSizing: "border-box",
				}}
			>
				{width < 480 ? null : (
					<Space>
						<Button
							onClick={getRandomWallpaper}
							type="text"
							style={{ pointerEvents: "all" }}
						>
							<FormatPainterFilled
								style={{ color: fontColor, fontSize: "18px" }}
							/>
						</Button>
					</Space>
				)}
				<Space
					style={{ marginRight: "14px", pointerEvents: "auto" }}
					size={4}
					wrap
				>
					<Button
						type="text"
						style={{
							fontWeight: "bold",
							display: model,
							color: fontColor,
							marginRight: "-10px",
						}}
						onClick={editFunction}
					>
						{editText}
					</Button>
					<Button
						type="text"
						style={{
							fontWeight: "bold",
							display: model,
							marginRight: "-10px",
							color: fontColor,
						}}
						onClick={() => {
							window.open("https://txc.qq.com/products/501945", linkOpen);
						}}
					>
						反馈
					</Button>
					<Dropdown
						menu={{
							items: moreMenu,
						}}
						overlayStyle={{
							width: "200px",
							pointerEvents: "auto",
						}}
						placement="bottomRight"
						getPopupContainer={() => document.getElementById("header")}
						trigger={["hover"]}
						arrow={true}
					>
						<Button
							type="text"
							style={{
								fontWeight: "bold",
								display: model,
								marginRight: "-10px",
								color: fontColor,
							}}
						>
							关于
						</Button>
					</Dropdown>
					<div id="others">
						<Dropdown
							dropdownRender={showOthers}
							overlayStyle={{
								width: "max-content",
								maxWidth: "300px",
								pointerEvents: "auto",
								borderRadius: "8px",
								backgroundColor: "#fff",
								padding: "12px",
								boxShadow:
									"0 6px 16px 0 rgba(0, 0, 0, 0.08), 0 3px 6px -4px rgba(0, 0, 0, 0.12), 0 9px 28px 8px rgba(0, 0, 0, 0.05)",
							}}
							placement="bottomRight"
							getPopupContainer={() => document.getElementById("header")}
							trigger={["hover"]}
							arrow={true}
						>
							<Button
								type="text"
								style={{
									display: "flex",
									alignItems: "center",
									fontWeight: "bold",
									marginRight: "-10px",
									color: fontColor,
								}}
							>
								<AppstoreFilled style={{ fontSize: "20px" }} />
							</Button>
						</Dropdown>
					</div>
				</Space>
			</div>
		</>
	);
};

export default Header;
