import { message, Modal } from "antd";
import React, { useState } from "react";
import { pushToNas } from "../common/dataIO";
import { cacheClear } from "../common/idbCache";
import { getBaseUrl, getToken } from "../common/nasStore";
import { funtabsData } from "./data";

const CACHE_KEY = "funtabsDoc";

export default function ResetData() {
	const [opened, setOpened] = useState(false);
	const [loading, setLoading] = useState(false);

	const cancelModal = () => {
		setOpened(false);
	};

	/**
	 * 自托管下"重置"必须写回 NAS：
	 * 只清 localStorage 的话，刷新时 NAS 会把旧数据重新推回来，等于没重置。
	 */
	async function confirm() {
		setLoading(true);
		// 保留自托管地址与 Token，其余本机设置清空
		const nasBaseUrl = getBaseUrl();
		const nasToken = getToken();
		window.localStorage.clear();
		window.sessionStorage.clear();
		if (nasBaseUrl) window.localStorage.setItem("nasBaseUrl", nasBaseUrl);
		if (nasToken) window.localStorage.setItem("nasToken", nasToken);
		await cacheClear(CACHE_KEY);

		const res = await pushToNas(funtabsData);
		setLoading(false);
		setOpened(false);
		if (res.ok) {
			message.success("已恢复为初始数据，即将刷新页面～");
		} else {
			message.warning(`本机已重置，但写入 NAS 失败：${res.message || "未知错误"}`);
		}
		setTimeout(() => window.location.reload(), 1200);
	}

	return (
		<>
			{/* eslint-disable-next-line */}
			<a onClick={() => setOpened(true)}>重置数据</a>
			<Modal
				title="重置数据"
				okText="确定重置"
				cancelText="取消"
				okButtonProps={{ danger: true }}
				confirmLoading={loading}
				onCancel={cancelModal}
				onOk={confirm}
				destroyOnClose
				focusTriggerAfterClose={false}
				open={opened}
			>
				将用初始默认数据<b>覆盖 NAS 上的现有数据</b>，同时清空本机的离线缓存。
				此操作不可撤销，建议先做一次导出备份。
			</Modal>
		</>
	);
}
