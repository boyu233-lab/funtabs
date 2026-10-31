import { uploadImage } from "./nasStore";

/**
 * 统一的文件上传入口（Xtab 自托管版）
 * 把 antd Upload 的 File 对象转成 dataURL 后上传到自建 NAS 后端，
 * 不再要求原作者服务器的登录 token；离线时退回内嵌 dataURL。
 *
 * @param {File} file antd Upload beforeUpload 拿到的文件
 * @returns {Promise<{url: string, offline: boolean}>}
 */
export async function uploadFileToNas(file) {
	const dataUrl = await new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
	return uploadImage(dataUrl, file.name || "upload");
}
