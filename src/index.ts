import Server from "@pxe/server";
import { match } from "path-to-regexp";

interface Router extends Server.Middleware { }

declare namespace Router {
    export interface RouteHandler {
        get(ctx: Server.Context): Promise<void> | void;
        post(ctx: Server.Context): Promise<void> | void;
        put(ctx: Server.Context): Promise<void> | void;
        delete(ctx: Server.Context): Promise<void> | void;
        head(ctx: Server.Context): Promise<void> | void;
        connect(ctx: Server.Context): Promise<void> | void;
        options(ctx: Server.Context): Promise<void> | void;
        trace(ctx: Server.Context): Promise<void> | void;
        patch(ctx: Server.Context): Promise<void> | void;
        all(ctx: Server.Context): Promise<void> | void;
        [method: string]: (ctx: Server.Context) => Promise<void> | void;
    }
}

// Add a new property to ctx.request
declare module "@pxe/server" {
    interface IncomingRequest {
        // @ts-ignore
        readonly params?: object;
    }
}

// List of route handlers
type RouteHandlerList = {
    [routeName: string]: Router.RouteHandler;
}

// Normalize the input route name
function normalize(route: string) {
    if (route.startsWith("/"))
        route = route.substring(1);
    return route;
}

// Run a route handler
async function runRoute(routeHandler: Router.RouteHandler, ctx: Server.Context) {
    // Run for all route
    if (typeof routeHandler.all === "function")
        await routeHandler.all(ctx);

    const routeMethodHandler = routeHandler[ctx.request.method.toLowerCase()];
    if (typeof routeMethodHandler === "function")
        await routeMethodHandler(ctx);
}

// Search for matching param route
function searchMatch(url: string, paramRoutes: RouteHandlerList) {
    for (const key in paramRoutes) {
        const mtch = match(key)(url);

        if (mtch)
            return {
                matches: key,
                params: mtch.params,
            };
    };
}

// Main class 
class Router extends Function {
    private readonly routes: RouteHandlerList;
    private readonly paramRoutes: RouteHandlerList;
    private readonly middlewares: Server.Middleware[];

    constructor(private root?: string) {
        super();

        if (!root)
            this.root = "/";
        else
            this.root = root;

        this.routes = {};
        this.paramRoutes = {};
        this.middlewares = [];

        return new Proxy(this, {
            apply(target, _, args) {
                return target.cb(...args as [Server.Context, Server.NextFunction, ...any[]])
            }
        });
    }

    handle(route: string, handler: Router.RouteHandler) {
        this.routes[this.root + normalize(route)] = handler;
    }

    param(route: string, handler: Router.RouteHandler) {
        this.paramRoutes[this.root + normalize(route)] = handler;
    }

    use(...m: Server.Middleware[]) {
        for (const md of m) {
            if (md instanceof Router)
                md.root += this.root;

            this.middlewares.push(md);
        }
    }

    async cb(ctx: Server.Context, next: Server.NextFunction, ...args: any[]) {
        // Run all middlewares
        const runMiddleware = async (i: number, ...a: any[]) => {
            const currentMiddleware = this.middlewares[i];

            // Run the next middleware
            if (i < this.middlewares.length && typeof currentMiddleware === "function")
                return currentMiddleware(
                    // @ts-ignore
                    ctx,
                    async (...args: any[]) => runMiddleware(i + 1, ...args),
                    ...a
                );

            // Run routes after running all the middlewares
            const routeHandler = this.routes[ctx.request.url];
            if (routeHandler)
                await runRoute(routeHandler, ctx);
            else {
                const obj = searchMatch(ctx.request.url, this.paramRoutes);

                if (obj) {
                    // @ts-ignore
                    ctx.request.params = obj.params;
                    await runRoute(this.paramRoutes[obj.matches], ctx);
                }
            }
        }
        if (ctx.request.url.startsWith(this.root))
            await runMiddleware(0);

        // Next middleware
        await next(...args);
    }
}

export = Router;