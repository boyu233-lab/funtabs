import React from "react";
import { FolderOutlined } from "@ant-design/icons";

/**
 * 左侧竖向分类导航（仿 WeTab 侧边标签）
 * ------------------------------------------
 * 由 home.jsx 在「导航位置 = 左侧」时渲染，替代顶部的横向 Tabs。
 *
 * 设计要点：
 * - fixed 定位、垂直居中，不占文档流，卡片网格区用 paddingLeft 让位
 * - 半透明玻璃拟态，适配任意壁纸；颜色跟随 fontColor（用户可改文字色）
 * - 支持拖拽卡片时悬停切换分类（沿用顶部 Tabs 的 drag 语义）
 * - 只有一个分类时（tabsVisibility === "none"）整体不渲染
 */
const SideTabs = React.memo((props) => {
	const { tabs, activeKey, onChange, fontColor, drag } = props;

	const handleChange = (key) => {
		const k = parseInt(key, 10);
		onChange(k);
	};

	return (
		// gridArea 容器是 pointer-events:none，这里必须显式恢复，否则点不到
		<nav
			className="side-tabs"
			aria-label="书签分类"
			style={{ pointerEvents: "all" }}
		>
			{tabs.map((item) => {
				const isActive = Number(item.key) === Number(activeKey);
				return (
					<div
						key={item.key}
						className={`side-tab-item${isActive ? " active" : ""}`}
						style={{ color: fontColor }}
						title={item.label}
						onClick={() => handleChange(item.key)}
						onDragOver={() => {
							// 拖拽卡片悬停时切换分类（与顶部 Tabs 行为一致）
							if (drag === false && !isActive) {
								handleChange(item.key);
							}
						}}
					>
						<FolderOutlined className="side-tab-icon" />
						<span className="side-tab-label">{item.label}</span>
					</div>
				);
			})}
		</nav>
	);
});

export default SideTabs;
