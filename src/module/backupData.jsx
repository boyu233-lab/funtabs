import { DownloadOutlined, UploadOutlined } from "@ant-design/icons";
import {
	Alert,
	Button,
	Col,
	Divider,
	Input,
	Modal,
	Radio,
	Row,
	Space,
	Upload,
	message,
} from "antd";
import beautify from "js-beautify";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
	downloadRawFromNas,
	importRawToNas,
	pullFromNas,
	pushToNas,
	timestampForFile,
	validateImport,
} from "../common/dataIO";
import getLocalData from "../common/getLocalData";
import transformToBookmarks from "../common/transformToBookmarks";

const { TextArea } = Input;

/** 导出框里显示的文本：字符串直接展示，对象才 JSON 化 */
function toDisplayText(data) {
	if (data === undefined || data === null) return "";
	return typeof data === "string" ? data : JSON.stringify(data);
}

function BackupData() {
	const [data2, setData2] = useState();
	const [backupData, setBackupData] = useState("");
	const [backupModal, setBackupModal] = useState(false);
	const [check, setCheck] = useState("all");
	const [styleCheck, setStyleCheck] = useState("txt");
	const [source, setSource] = useState("local"); // nas | local
	const [saving, setSaving] = useState(false);
	const [ymlBusy, setYmlBusy] = useState(false);

	/** 从 NAS 下载原始 YAML：可直接编辑、可进 git，是最推荐的备份方式 */
	const handleDownloadYaml = useCallback(async () => {
		setYmlBusy(true);
		try {
			const name = await downloadRawFromNas("yaml");
			message.success(`已导出 ${name}`);
		} catch (e) {
			message.error(e.message || "YAML 导出失败");
		}
		setYmlBusy(false);
	}, []);

	/** 上传 YAML 文件，由服务端解析后直接写入 NAS */
	const handleUploadYaml = useCallback(async (file) => {
		setYmlBusy(true);
		try {
			const text = await file.text();
			await importRawToNas(text, "yaml");
			message.success("已写入 NAS，页面即将刷新");
			setTimeout(() => window.location.reload(), 1200);
		} catch (e) {
			message.error(e.message || "YAML 导入失败");
		}
		setYmlBusy(false);
	}, []);

	const getLocalStorage = useCallback(async () => {
		const data = await getLocalData();
		setData2(data);
	}, []);

	useEffect(() => {
		if (!backupModal) {
			setData2();
			return;
		}
		setBackupData("");
		setCheck("all");
		setStyleCheck("txt");
		setSaving(false);
		let alive = true;
		// 导出前先以 NAS 为真相源拉一次，避免导出的是本机陈旧缓存
		(async () => {
			const res = await pullFromNas();
			if (!alive) return;
			setSource(res.offline ? "local" : "nas");
			const data = await getLocalData();
			if (!alive) return;
			setData2(data);
		})();
		return () => {
			alive = false;
		};
		// eslint-disable-next-line
	}, [backupModal]);

	const saveFile = useCallback(
		(raw) => {
			const text = typeof raw === "string" ? raw : JSON.stringify(raw);
			if (!text) {
				message.error("导出数据为空！");
				return;
			}
			const formattedText =
				styleCheck === "html"
					? beautify.html(text, { indent_size: 2 })
					: text;
			const blob = new Blob([formattedText], {
				type: styleCheck === "html" ? "text/html;charset=utf-8" : "text/plain;charset=utf-8",
			});
			const objectURL = URL.createObjectURL(blob);
			const aTag = document.createElement("a");
			aTag.href = objectURL;
			// 文件名不能含 ":"，否则 Windows 下载会被系统改名或失败
			aTag.download = `Xtab备份_${timestampForFile()}.${styleCheck}`;
			aTag.click();
			URL.revokeObjectURL(objectURL);
			message.success("数据导出本地成功，请妥善保存！");
		},
		[styleCheck]
	);

	const analysisData = useCallback((e) => {
		const content = e.target.value;
		if (content.trim() === "") return;
		const res = validateImport(content);
		if (!res.ok) message.error(`数据格式错误：${res.reason}`);
	}, []);

	/**
	 * 恢复设置项到 localStorage。
	 * 注意：自托管地址与 Token 属于本机配置，先快照再还原，不能被清空。
	 */
	const restoreLocalStorage = useCallback((data) => {
		const keep = {
			token: window.localStorage.getItem("token"),
			nasBaseUrl: window.localStorage.getItem("nasBaseUrl"),
			nasToken: window.localStorage.getItem("nasToken"),
		};
		window.localStorage.clear();
		Object.entries(keep).forEach(([key, value]) => {
			if (value) window.localStorage.setItem(key, value);
		});
		Object.entries(data).forEach(([key, value]) => {
			if (key === "token" || key === "nasBaseUrl" || key === "nasToken") return;
			if (
				key.startsWith("time") ||
				key.startsWith("note") ||
				key.startsWith("begin") ||
				key.startsWith("end") ||
				key.startsWith("hotEvent") ||
				key.startsWith("weather_") ||
				key.startsWith("om_weather_") ||
				key.startsWith("om_geo_") ||
				key === "funtabs" ||
				key === "dailyWallpaper" ||
				key === "brightness" ||
				key === "showClock" ||
				key === "activeKey" ||
				key === "wallpaperType" ||
				key === "fontColor" ||
				key === "linkOpen" ||
				key === "paddingTop" ||
				key === "boxShadow" ||
				key === "backgroundImage" ||
				key === "blur" ||
				key === "model" ||
				key === "noticeOpen" ||
				key === "boxShadowOpen" ||
				key === "showSearch" ||
				key === "webTitle" ||
				key === "searchEngine" ||
				key === "searchEngineList" ||
				key === "localHotEventColor" ||
				key === "timeArea" ||
				key === "logoUrl" ||
				key === "saveTime" ||
				key === "clockAreaHeight" ||
				key === "showSettings" ||
				key === "autoCloudSync" ||
				key === "searchBackgroundColor" ||
				key === "searchBlurOpen" ||
				key === "searchBlurNumber" ||
				key === "searchRadius" ||
				key === "searchFontColor" ||
				key === "timeSeconds" ||
				key === "searchAutoFocus"
			) {
				window.localStorage.setItem(key, value);
			}
		});
	}, []);

	const restore = useCallback(async () => {
		if (!backupData || backupData.trim() === "") {
			message.error("请先粘贴或选择备份内容");
			return;
		}
		const parsed = validateImport(backupData);
		if (!parsed.ok) {
			message.error(`导入失败：${parsed.reason}`);
			return;
		}
		setSaving(true);
		// 先还原外观设置，再把书签与布局写回 NAS
		if (parsed.settings) restoreLocalStorage(parsed.settings);
		const res = await pushToNas(parsed.newData);
		setSaving(false);
		if (res.ok) {
			message.success("导入成功，已同步到 NAS，页面即将刷新");
			setTimeout(() => window.location.reload(), 1200);
			setBackupModal(false);
		} else if (res.offline) {
			message.warning(`${res.message || "NAS 不可达"}，请勿清理浏览器数据`);
			setBackupModal(false);
		} else {
			message.error(res.message || "导入失败");
		}
	}, [backupData, restoreLocalStorage]);

	const options = useMemo(
		() => [
			{ label: "全部", value: "all" },
			{ label: "布局卡片", value: "card" },
		],
		[]
	);

	const fileType = useMemo(
		() => [
			{ label: "文本（.txt）", value: "txt" },
			{ label: "浏览器书签（.html）", value: "html" },
		],
		[]
	);

	const getCardData = useCallback(async () => {
		const cardData = {};
		const linkList = localStorage.getItem("funtabs");
		cardData["funtabs"] = linkList;
		return cardData;
	}, []);

	const changeCheck = useCallback(
		async (e) => {
			setCheck(e.target.value);
			const type = e.target.value;
			if (type === "card") {
				const cardData = await getCardData();
				setData2(cardData);
			} else {
				setStyleCheck("txt");
				getLocalStorage();
			}
		},
		[getCardData, getLocalStorage]
	);

	const changeCheck2 = useCallback(
		async (e) => {
			setStyleCheck(e.target.value);
			const type = e.target.value;
			if (type === "html") {
				let localFuntabsData = null;
				try {
					localFuntabsData = JSON.parse(localStorage.getItem("funtabs"));
				} catch (err) {
					localFuntabsData = null;
				}
				if (localFuntabsData && localFuntabsData.newData) {
					setCheck("card");
					const content = localFuntabsData.newData.content || [];
					const newContent = [...content];
					for (let i = 0; i < newContent.length; i++) {
						newContent[i].type = "folder";
					}
					setData2(transformToBookmarks(newContent));
				} else {
					message.error("未保存个性编辑内容，将无法导出浏览器书签样式");
					setStyleCheck("txt");
				}
			} else {
				if (check === "card") {
					const cardData = await getCardData();
					setData2(cardData);
				} else {
					getLocalStorage();
				}
			}
		},
		[check, getCardData, getLocalStorage]
	);

	return (
		<>
			{/* eslint-disable-next-line */}
			<p onClick={() => setBackupModal(true)}>备份/恢复数据</p>
			<Modal
				title="备份/恢复数据"
				open={backupModal}
				onCancel={() => setBackupModal(false)}
				okText="确认导入"
				cancelText="取消"
				onOk={restore}
				confirmLoading={saving}
				focusTriggerAfterClose={false}
				destroyOnClose
			>
				<Alert
					type={source === "nas" ? "success" : "warning"}
					showIcon
					style={{ marginTop: 8 }}
					message={
						source === "nas"
							? "已按 NAS 上的最新数据生成备份内容"
							: "未能连接 NAS，导出内容来自本机缓存，可能不是最新"
					}
				/>

				<Row style={{ margin: "12px 0px", alignItems: "center" }}>
					<Col flex="78px">导出数据：</Col>
					<Col flex="1">
						<TextArea rows={1} value={toDisplayText(data2)} />
					</Col>
					<Col>
						<Button
							style={{ width: "80px" }}
							icon={<DownloadOutlined />}
							onClick={() => saveFile(data2)}
						>
							导出
						</Button>
					</Col>
				</Row>
				<Row style={{ alignItems: "center" }}>
					<Col flex="78px">导入数据：</Col>
					<Col flex="1">
						<Input
							value={backupData}
							autoComplete="off"
							onChange={(e) => setBackupData(e.target.value)}
							onBlur={analysisData}
						/>
					</Col>
					<Col>
						<Upload
							accept=".txt,.html,.json"
							showUploadList={false}
							maxCount={1}
							beforeUpload={(file) => {
								const reader = new FileReader();
								reader.readAsText(file);
								reader.onloadend = function () {
									setBackupData(reader.result);
									const res = validateImport(reader.result);
									if (res.ok) message.success("文件已读取，点确认导入即可写入 NAS");
									else message.error(`文件格式不支持：${res.reason}`);
								};
								return false;
							}}
						>
							<Button style={{ width: "80px" }} icon={<UploadOutlined />}>
								导入
							</Button>
						</Upload>
					</Col>
				</Row>
				<Space style={{ padding: "16px 0px 0px 0px" }} wrap size={0}>
					<p style={{ width: "78px" }}>导出范围：</p>
					<Radio.Group
						options={options}
						onChange={changeCheck}
						value={check}
						optionType="default"
					/>
				</Space>
				<Space style={{ padding: "18px 0px 0px 0px" }} wrap size={0}>
					<p style={{ width: "78px" }}>导出格式：</p>
					<Radio.Group
						options={fileType}
						onChange={changeCheck2}
						value={styleCheck}
						optionType="txt"
					/>
				</Space>
				<p style={{ marginTop: 12, color: "#8c8c8c", fontSize: 12 }}>
					导入会覆盖 NAS 上的现有数据，建议先导出一份当前备份。
					{styleCheck === "html" ? " HTML 格式仅供迁移到其他浏览器，不能导入回来。" : ""}
				</p>

				<Divider style={{ margin: "12px 0" }}>推荐：直接用数据文件备份</Divider>
				<Space wrap>
					<Button
						icon={<DownloadOutlined />}
						loading={ymlBusy}
						onClick={handleDownloadYaml}
					>
						下载 YAML
					</Button>
					<Upload
						accept=".yaml,.yml"
						showUploadList={false}
						maxCount={1}
						beforeUpload={(file) => {
							handleUploadYaml(file);
							return false;
						}}
					>
						<Button icon={<UploadOutlined />} loading={ymlBusy}>
							上传 YAML 写入 NAS
						</Button>
					</Upload>
				</Space>
				<p style={{ marginTop: 8, color: "#8c8c8c", fontSize: 12 }}>
					YAML 就是 NAS 上的主数据文件（data/funtabs.yaml），可直接用文本编辑器批量改网址、
					放进 git 做版本管理；改完上传即可生效，无需逐个点卡片。
				</p>
			</Modal>
		</>
	);
}

export default BackupData;
