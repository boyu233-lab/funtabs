import {
	Alert,
	Button,
	Divider,
	Input,
	Modal,
	Space,
	Spin,
	Switch,
	Tabs,
	Tag,
	Typography,
	message,
} from "antd";
import { useEffect, useRef, useState } from "react";
import {
	connectVault,
	getConfig,
	getVaultHandle,
	listNotes,
	quickCapture,
	readNote,
	setConfig,
	supportsFileSystemAccess,
	writeNote,
} from "../common/obsidian";

const { TextArea } = Input;

export default function ObsidianPanel(props) {
	const { open, onClose } = props;
	const [config, setLocalConfig] = useState({
		vault: "",
		daily: true,
		note: "",
		heading: "收集箱",
		useClipboard: true,
	});
	const [captureText, setCaptureText] = useState("");
	const [sending, setSending] = useState(false);

	const [handle, setHandle] = useState(null);
	const [notes, setNotes] = useState([]);
	const [currentPath, setCurrentPath] = useState("");
	const [noteContent, setNoteContent] = useState("");
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const captureRef = useRef();

	useEffect(() => {
		if (!open) return;
		getConfig().then(setLocalConfig);
		getVaultHandle().then((h) => {
			setHandle(h);
			if (h) refreshNotes(h);
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	async function refreshNotes(h) {
		setLoading(true);
		try {
			const list = await listNotes(h || handle);
			setNotes(list);
		} catch (e) {
			message.error(`读取笔记失败：${e.message}`);
		} finally {
			setLoading(false);
		}
	}

	async function saveConfig(patch) {
		const next = await setConfig(patch);
		setLocalConfig(next);
	}

	async function handleCapture() {
		if (!captureText.trim()) {
			message.warning("请输入要收集的内容");
			return;
		}
		if (!config.vault) {
			message.warning("请先填写 vault 名称");
			return;
		}
		setSending(true);
		try {
			await quickCapture(captureText);
			setCaptureText("");
			message.success("已发送给 Obsidian，请在 Obsidian 中确认");
		} catch (e) {
			message.error(`发送失败：${e.message}`);
		} finally {
			setSending(false);
		}
	}

	async function handleConnect() {
		try {
			const h = await connectVault();
			setHandle(h);
			await refreshNotes(h);
			message.success("已连接 vault");
		} catch (e) {
			if (e.name !== "AbortError") {
				message.error(`连接失败：${e.message}`);
			}
		}
	}

	async function handleOpenNote(path) {
		setLoading(true);
		try {
			setCurrentPath(path);
			const text = await readNote(handle, path);
			setNoteContent(text);
		} catch (e) {
			message.error(`打开失败：${e.message}`);
		} finally {
			setLoading(false);
		}
	}

	async function handleSaveNote() {
		if (!handle) {
			message.warning("请先连接 vault");
			return;
		}
		setSaving(true);
		try {
			const saved = await writeNote(handle, currentPath, noteContent);
			setCurrentPath(saved);
			message.success("已写入 vault");
			await refreshNotes(handle);
		} catch (e) {
			message.error(`保存失败：${e.message}`);
		} finally {
			setSaving(false);
		}
	}

	const items = [
		{
			key: "capture",
			label: "快速收集",
			children: (
				<Space direction="vertical" style={{ width: "100%" }} size="middle">
					<TextArea
						ref={captureRef}
						value={captureText}
						onChange={(e) => setCaptureText(e.target.value)}
						rows={5}
						placeholder="随手记一笔，Ctrl + Enter 发送到 Obsidian"
						onKeyDown={(e) => {
							if (e.ctrlKey && e.key === "Enter") handleCapture();
						}}
					/>
					<Space wrap>
						<Button type="primary" loading={sending} onClick={handleCapture}>
							发送到 Obsidian
						</Button>
						<Typography.Text type="secondary">
							需要 Obsidian 已安装 Advanced URI 插件并保持运行
						</Typography.Text>
					</Space>
					<Divider orientation="left" plain>
						收集设置
					</Divider>
					<Space direction="vertical" style={{ width: "100%" }}>
						<Space>
							<Typography.Text>vault 名称</Typography.Text>
							<Input
								style={{ width: 200 }}
								value={config.vault}
								placeholder="如 MyVault"
								onChange={(e) => saveConfig({ vault: e.target.value })}
							/>
						</Space>
						<Space>
							<Typography.Text>追加到当天日记</Typography.Text>
							<Switch
								checked={config.daily}
								onChange={(v) => saveConfig({ daily: v })}
							/>
							{!config.daily ? (
								<Input
									style={{ width: 200 }}
									value={config.note}
									placeholder="指定笔记名（不含 .md）"
									onChange={(e) => saveConfig({ note: e.target.value })}
								/>
							) : null}
						</Space>
						<Space>
							<Typography.Text>目标标题</Typography.Text>
							<Input
								style={{ width: 200 }}
								value={config.heading}
								placeholder="如 收集箱"
								onChange={(e) => saveConfig({ heading: e.target.value })}
							/>
						</Space>
						<Space>
							<Typography.Text>用剪贴板传内容</Typography.Text>
							<Switch
								checked={config.useClipboard}
								onChange={(v) => saveConfig({ useClipboard: v })}
							/>
							<Typography.Text type="secondary">
								内容很长时建议开启
							</Typography.Text>
						</Space>
					</Space>
				</Space>
			),
		},
		{
			key: "notes",
			label: "编辑笔记",
			children: (
				<Space direction="vertical" style={{ width: "100%" }} size="middle">
					{!supportsFileSystemAccess() ? (
						<Alert
							type="warning"
							showIcon
							message="当前浏览器不支持本地目录访问，请使用 Chrome 或 Edge"
						/>
					) : null}
					<Space wrap>
						<Button onClick={handleConnect}>
							{handle ? "重新选择 vault 目录" : "连接 vault 目录"}
						</Button>
						{handle ? (
							<Tag color="green">已连接，可直接读写 .md 文件</Tag>
						) : (
							<Tag color="orange">未连接</Tag>
						)}
						<Button onClick={() => refreshNotes(handle)} disabled={!handle}>
							刷新列表
						</Button>
					</Space>
					{loading ? (
						<Spin />
					) : (
						<Space wrap>
							{notes.slice(0, 300).map((note) => (
								<Tag
									key={note.path}
									color={note.path === currentPath ? "blue" : "default"}
									style={{ cursor: "pointer" }}
									onClick={() => handleOpenNote(note.path)}
								>
									{note.path}
								</Tag>
							))}
							{!notes.length && handle ? (
								<Typography.Text type="secondary">
									未找到 markdown 文件
								</Typography.Text>
							) : null}
						</Space>
					)}
					<Input
						value={currentPath}
						onChange={(e) => setCurrentPath(e.target.value)}
						placeholder="笔记路径，如 Inbox/收集箱.md（留空新建会提示填写）"
					/>
					<TextArea
						value={noteContent}
						onChange={(e) => setNoteContent(e.target.value)}
						rows={12}
						placeholder="选择一个笔记开始编辑，或直接输入内容并保存为新笔记"
					/>
					<Button
						type="primary"
						loading={saving}
						disabled={!handle}
						onClick={handleSaveNote}
					>
						保存到 vault
					</Button>
				</Space>
			),
		},
	];

	return (
		<Modal
			open={open}
			onCancel={onClose}
			footer={null}
			width="100%"
			style={{ maxWidth: 900 }}
			centered
			title="Obsidian"
			destroyOnClose
		>
			<Tabs defaultActiveKey="capture" items={items} />
		</Modal>
	);
}
