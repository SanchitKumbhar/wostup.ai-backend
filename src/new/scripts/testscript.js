/**
 * @typedef {Object} RouteFormat
 * @property {string} route
 * @property {string} method
 * @property {string} workspace
 * @property {string} project
 * @property {string} user
 */


async function getData() {
    const routes = await fetch("D:\\wostup_v4\\startup-navigator\\docs\\API_ROUTES.json");
    const data = await routes.json();
    data.routes.forEach(async(route)=> {
        // Process each route
        if (route.method === "POST") {
            await fetch(`http://localhost:3000${route.path}`, {
                method: route.method,
                body: {
                    workspaceId,
                    projectId,
                    userId
                },
                headers: {
                    auth: userId
                }
            });
        }
        else if (route.method === "PUT" || route.method === "PATCH" || route.method==="GET") {
            await fetch(`http://localhost:3000${route.path}`, {
                method: route.method,
                headers: {
                    auth: userId,
                    params: {
                        workspaceId,
                        projectId,
                        userId
                    }
                }
            });
        }
    });
}
