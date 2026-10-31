import {
	Alert,
	Button,
	Descriptions,
	Divider,
	Form,
	Input,
	Modal,
	Space,
	Tag,
	Typography,
	message,
} from "antd";
import { useEffect, useState } from "react";
import { ping } from "../common/nasStore";
import { VERSION_LABEL, VERSION_TITLE } from "../common/version";
import {
	getBaseUrl,
	getToken,
	retrySync,
	setBaseUrl,
	setToken,
} from "../common/nasStore";

const { Paragraph, Text } = Typography;

export default function SelfHostPanel(props) {
	// standalone=true 时作为独立页面内容渲染（不使用 Modal 包裹）
	const { open = true, onClose, standalone = false } = props;
	const [baseUrl, setLocalBaseUrl] = useState("");
	const [token, setLocalToken] = useState("");
	const [testing, setTesting] = useState(false);
	const [status, setStatus] = useState(null); // ok | fail | notset
	const [secure, setSecure] = useState(true);

	useEffect(() => {
		if (!open) return;
		setLocalBaseUrl(getBaseUrl());
		setLocalToken(getToken());
		setStatus(null);
		setSecure(
			window.isSecureContext ||
				["localhost", "127.0.0.1"].includes(window.location.hostname)
		);
	}, [open]);

	async function handleTest() {
		setTesting(true);
		// 先落地配置再探测，保证 ping 用的是刚填的值
		setBaseUrl(baseUrl);
		setToken(token);
		try {
			const ok = await ping();
			setStatus(ok ? "ok" : "fail");
			if (ok) message.success("连接成功");
			else message.error("连接失败，请检查地址与 Token");
		} catch (e) {
			setStatus("fail");
			message.error(`连接失败：${e.message}`);
		}
		setTesting(false);
	}

	function handleSave() {
		setBaseUrl(baseUrl);
		setToken(token);
		message.success("已保存，正在重新同步");
		retrySync();
		if (onClose) onClose();
	}

	const body = (
		<Space direction="vertical" size="middle" style={{ width: "100%" }}>
				{!secure && (
					<Alert
						type="warning"
						showIcon
						message="当前不是 HTTPS 安全上下文"
						description="公网 HTTP 下浏览器会禁用 File System Access API，Obsidian 直连 vault 的通道将不可用。请为域名配置 HTTPS 后再使用该功能。"
					/>
				)}

				<Form layout="vertical">
					<Form.Item
						label="服务地址"
						tooltip="留空表示使用当前页面自身的地址。只有在前端与后端不同域时才需要填，例如 https://nas.example.com"
					>
						<Input
							value={baseUrl}
							onChange={(e) => setLocalBaseUrl(e.target.value)}
							placeholder="留空 = 当前站点"
							allowClear
						/>
					</Form.Item>

					<Form.Item
						label="API Token"
						tooltip="与服务端环境变量 API_TOKEN 保持一致。服务端未设置时这里也留空"
					>
						<Input.Password
							value={token}
							onChange={(e) => setLocalToken(e.target.value)}
							placeholder="公网访问必须设置"
							allowClear
						/>
					</Form.Item>
				</Form>

				<Space>
					<Button
						onClick={handleTest}
						loading={testing}
						disabled={!baseUrl && !token}
					>
						测试连接
					</Button>
					{status === "ok" && <Tag color="success">已连接</Tag>}
					{status === "fail" && <Tag color="error">连接失败</Tag>}
				</Space>

				<Divider style={{ margin: "8px 0" }} />

				<Descriptions column={1} size="small" bordered>
					<Descriptions.Item label="版本">
						<Text code title={VERSION_TITLE}>
							{VERSION_LABEL}
						</Text>
					</Descriptions.Item>
					<Descriptions.Item label="数据位置">
						<Text code>{baseUrl || window.location.origin}</Text>
					</Descriptions.Item>
					<Descriptions.Item label="安全上下文">
						{secure ? (
							<Tag color="success">HTTPS / 本机</Tag>
						) : (
							<Tag color="warning">HTTP（Obsidian 直连不可用）</Tag>
						)}
					</Descriptions.Item>
				</Descriptions>

				<Paragraph type="secondary" style={{ marginBottom: 0 }}>
					所有数据保存在服务端的 data/funtabs.json，浏览器只保留离线缓存。
					公网部署时请务必设置 API_TOKEN，否则任何人都能读写你的数据。
				</Paragraph>
			</Space>
	);

	if (standalone) return body;

	return (
		<Modal
			title="自托管设置"
			open={open}
			onCancel={onClose}
			onOk={handleSave}
			okText="保存并同步"
			cancelText="取消"
			width={560}
		>
			{body}
		</Modal>
	);
}
