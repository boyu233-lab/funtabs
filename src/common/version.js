/**
 * Xtab 版本信息（单一来源）
 *
 * 每次发版必须同步修改以下三处：
 *   1. src/common/version.js      —— 前端展示与打包
 *   2. server/index.js 的 APP_VERSION —— /api/health 对外暴露
 *   3. package.json 的 version
 * 并在 CHANGELOG.md 中记录本次变更。
 */

export const APP_NAME = "Xtab";

/** 语义化版本号：主版本.次版本.修订号 */
export const APP_VERSION = "1.3.0";

/** 构建日期，用于区分同一版本号的多次打包（YYYY-MM-DD） */
export const APP_BUILD_DATE = "2026-10-31";

/** 页面角标展示文本，例如 "Xtab v1.0.1" */
export const VERSION_LABEL = `${APP_NAME} v${APP_VERSION}`;

/** 悬浮提示文本，例如 "Xtab v1.0.1 · 构建于 2026-10-31" */
export const VERSION_TITLE = `${APP_NAME} v${APP_VERSION} · 构建于 ${APP_BUILD_DATE}`;
