// 从网上抄来的react路由守卫
import { Spin } from "antd";
import { Suspense, useEffect } from "react";
import { Outlet, useLocation, useNavigate, useRoutes } from "react-router-dom";
import { Home } from "./module/home";
import SelfHostPage from "./module/selfHostPage";

// 允许直接访问的路径，其余一律回首页
const ALLOWED_PATHS = ["/", "/selfhost", "/settings"];

const Myrouters = [
	{
		path: "/",
		element: <Home />,
	},
	{
		path: "/selfhost",
		element: <SelfHostPage />,
	},
	// 别名，方便记忆
	{
		path: "/settings",
		element: <SelfHostPage />,
	},
];

const RouterBeforeEach = () => {
	const location = useLocation();
	const navigator = useNavigate();

	useEffect(() => {
		if (!ALLOWED_PATHS.includes(location.pathname)) {
			navigator("/");
		}
	});

	return (
		<>
			<Outlet />
		</>
	);
};

const Router = () => (
	<Suspense fallback={<Spin />}>{useRoutes(Myrouters)}</Suspense>
);
export { Router, RouterBeforeEach };
