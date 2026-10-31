import React, { memo, useEffect, useMemo, useState } from "react";
import { Flipper } from "react-flip-toolkit";
import { useSelector } from "react-redux";
import { Input } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import Slider from "react-slick";
import { ReactSortable } from "react-sortablejs";
import "slick-carousel/slick/slick-theme.css";
import "slick-carousel/slick/slick.css";
import "../common/funtabs.css";
import DefaultStyle from "../showStyle/defaultStyle";
import OnlyIconStyle from "../showStyle/onlyIconStyle";
import OnlyText from "../showStyle/onlyText";
import PhoneStyle from "../showStyle/phoneStyle";

const ShowList = memo((props) => {
	const {
		cardStyle,
		tabs,
		gap,
		num,
		newlinkList,
		setNewLinkList,
		gridStyle,
		drag,
		edit,
		radius,
		widthNum,
		heightNum,
		tabsActiveKey,
		setTabsActiveKey,
		linkOpen,
		fontColor,
		editFunction,
	} = props;

	const deviceType = useSelector((state) => state.deviceType.type);
	const [a, setA] = useState(0);
	const [folderDisabled, setFolderDisabled] = useState(true);
	const [click] = useState(0);
	// 书签即时搜索（Ctrl+F 风格本地过滤），仅按名称/网址过滤当前分类
	const [q, setQ] = useState("");
	// 只挂载当前分类与左右相邻分类，其余留占位，避免一次性渲染全部卡片
	const [activeSlide, setActiveSlide] = useState(num);

	useEffect(() => {
		setFolderDisabled(edit !== "");
	}, [edit]);

	useEffect(() => {
		setTimeout(() => {
			setA(1);
		}, 500);
	}, []);

	function showKey(a) {
		return deviceType === "PC" && a !== 0 ? newlinkList : false;
	}

	const settings = {
		dots: false,
		infinite: false,
		adaptiveHeight: true,
		touchMove: false,
		initialSlide: num,
		arrows: false,
		beforeChange: (current, next) => setActiveSlide(next),
	};

	const creatLinkList = useMemo(
		() => (item, index) => {
			// 视口外的分类只留占位，切过去时才真正挂载卡片
			if (Math.abs(index - activeSlide) > 1) {
				return <div key={index} style={{ minHeight: "60vh" }} />;
			}
			// 书签即时搜索：仅浏览态（edit==="none"）启用；编辑态不过滤，
			// 避免过滤后的数组下标与 content 真实下标错位导致删错/改错书签
			const kw = q.trim().toLowerCase();
			const searching = kw !== "" && edit === "none" && deviceType === "PC";
			const displayContent = searching
				? item.content.filter(
						(c) =>
							(c.label || "").toLowerCase().includes(kw) ||
							(c.link || "").toLowerCase().includes(kw)
				  )
				: item.content;
			return (
				<div key={index}>
					<div
						id="grid-div"
						style={{
							display: "flex",
							justifyContent: "center",
						}}
					>
						<ReactSortable
							group="1"
							id={`sortable${item.key}`}
							key={deviceType === "PC" ? "sortable" : "sortable-phone"}
							list={displayContent}
							setList={(e) => {
								// 搜索过滤中 displayContent 是子集，若写回会丢失被过滤的书签
								if (searching) return;
								newlinkList[index].content = e;
								setNewLinkList([...newlinkList]);
							}}
							className="grid"
							tag="div"
							ghostClass="drag-background-class"
							style={{ ...gridStyle }}
							disabled={drag || searching}
							animation={deviceType === "PC" ? 300 : 0}
							onStart={() => setA(0)}
							onChoose={(e) => {
								const checkItem = e.item.getAttribute("data-flip-id");
								const result = checkItem?.substring(0, 4);
								if (result !== "link") {
									setFolderDisabled(true);
								}
							}}
							onUnchoose={() => {
								setFolderDisabled(false);
							}}
							onEnd={() => {
								setTimeout(() => {
									setA(1);
								}, 10);
							}}
						>
							{displayContent.map((item, index) => {
								switch (cardStyle) {
									case "defaultCard":
										return (
											<DefaultStyle
												key={item.link + item.type + item.id}
												id={index}
												edit={edit}
												item={item}
												linkList={newlinkList}
												setLinkList={setNewLinkList}
												radius={radius}
												num={num}
												gap={gap}
												widthNum={widthNum}
												heightNum={heightNum}
												tabsActiveKey={tabsActiveKey}
												setTabsActiveKey={setTabsActiveKey}
												cardStyle={cardStyle}
												linkOpen={linkOpen}
												setA={setA}
												folderDisabled={folderDisabled}
												click={click}
												editFunction={editFunction}
											/>
										);
									case "onlyIconCard":
										return (
											<OnlyIconStyle
												key={item.link + item.type + item.id}
												id={index}
												edit={edit}
												item={item}
												linkList={newlinkList}
												setLinkList={setNewLinkList}
												radius={radius}
												num={num}
												gap={gap}
												widthNum={widthNum}
												heightNum={heightNum}
												tabsActiveKey={tabsActiveKey}
												setTabsActiveKey={setTabsActiveKey}
												cardStyle={cardStyle}
												linkOpen={linkOpen}
												setA={setA}
												folderDisabled={folderDisabled}
												click={click}
												editFunction={editFunction}
											/>
										);
									case "phoneCard":
										return (
											<PhoneStyle
												key={item.link + item.type + item.id}
												id={index}
												edit={edit}
												item={item}
												linkList={newlinkList}
												setLinkList={setNewLinkList}
												radius={radius}
												num={num}
												gap={gap}
												widthNum={widthNum}
												heightNum={heightNum}
												tabsActiveKey={tabsActiveKey}
												setTabsActiveKey={setTabsActiveKey}
												cardStyle={cardStyle}
												linkOpen={linkOpen}
												setA={setA}
												folderDisabled={folderDisabled}
												click={click}
												editFunction={editFunction}
											/>
										);
									case "onlyText":
										return (
											<OnlyText
												key={item.link + item.type + item.id}
												id={index}
												edit={edit}
												item={item}
												linkList={newlinkList}
												setLinkList={setNewLinkList}
												radius={radius}
												num={num}
												gap={gap}
												widthNum={widthNum}
												heightNum={heightNum}
												tabsActiveKey={tabsActiveKey}
												setTabsActiveKey={setTabsActiveKey}
												cardStyle={cardStyle}
												linkOpen={linkOpen}
												setA={setA}
												folderDisabled={folderDisabled}
												click={click}
												fontColor={fontColor}
												editFunction={editFunction}
											/>
										);
									default:
										return null;
								}
							})}
						</ReactSortable>
					</div>
				</div>
			);
		},
		[
			newlinkList,
			gridStyle,
			drag,
			setNewLinkList,
			setA,
			folderDisabled,
			// 补全闭包依赖，避免 props 变化后仍用旧值渲染
			activeSlide,
			deviceType,
			cardStyle,
			radius,
			widthNum,
			heightNum,
			linkOpen,
			fontColor,
			editFunction,
			gap,
			click,
			edit,
			num,
			setTabsActiveKey,
			tabsActiveKey,
			q,
		]
	);

	return (
		<>
			{/* 书签即时搜索框（Ctrl+F 风格本地过滤，仅 PC 浏览态） */}
			{edit === "none" && deviceType === "PC" ? (
				<div
					style={{
						position: "sticky",
						top: 0,
						zIndex: 30,
						display: "flex",
						justifyContent: "center",
						padding: "10px 0 4px",
						pointerEvents: "all",
					}}
				>
					<Input
						allowClear
						prefix={
							<SearchOutlined style={{ color: "rgba(255,255,255,0.65)" }} />
						}
						placeholder="搜索本页书签（名称 / 网址）"
						value={q}
						onChange={(e) => setQ(e.target.value)}
						variant="filled"
						style={{
							maxWidth: 340,
							background: "rgba(255,255,255,0.16)",
							borderColor: "transparent",
							color: "#fff",
						}}
					/>
				</div>
			) : null}
			<Flipper flipKey={showKey(a)} spring="veryGentle">
				<Slider ref={tabs} {...settings}>
					{newlinkList.map(creatLinkList)}
				</Slider>
			</Flipper>
		</>
	);
});

export default ShowList;
