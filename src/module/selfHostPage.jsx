import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button, Card, Space, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import { VERSION_LABEL, VERSION_TITLE } from "../common/version";
import SelfHostPanel from "./selfHostPanel";

const { Paragraph, Text, Title } = Typography;

/**
 * 独立设置页面：/selfhost
 *
 * 主页不再放置自托管入口（避免在日常浏览的页面上暴露 NAS 地址与 Token），
 * 需要修改配置时在地址栏访问 https://你的域名/selfhost 进入本页。
 */
export default function SelfHostPage() {
	const navigate = useNavigate();

	return (
		<div
			style={{
				minHeight: "100vh",
				padding: "32px 16px",
				background: "#f5f5f5",
				display: "flex",
				justifyContent: "center",
				alignItems: "flex-start",
			}}
		>
			<Card
				style={{ width: "100%", maxWidth: 640 }}
				title={
					<Space>
						<span>自托管设置</span>
						<Text type="secondary" style={{ fontWeight: 400 }} title={VERSION_TITLE}>
							{VERSION_LABEL}
						</Text>
					</Space>
				}
				extra={
					<Button
						type="text"
						icon={<ArrowLeftOutlined />}
						onClick={() => navigate("/")}
					>
						返回首页
					</Button>
				}
			>
				<Paragraph type="secondary">
					本页是独立设置页，主页不提供入口，请在地址栏输入{" "}
					<Text code>/selfhost</Text> 进入。配置保存在浏览器本地，数据本身始终存放在
					NAS 的 data 目录。
				</Paragraph>

				<SelfHostPanel standalone onClose={() => navigate("/")} />
			</Card>
		</div>
	);
}
