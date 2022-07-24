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

declare module "@pxe/server" {
    interface IncomingRequest {
        // @ts-ignore
        readonly params?: object;
    }
}

type RouteHandlerList = {
    [routeName: string]: Router.RouteHandler;
}

class Router extends Function {
    private readonly routes: RouteHandlerList;
    private readonly paramRoutes: RouteHandlerList;
    private readonly middlewares: Server.Middleware[];

    constructor(private root: string = "/") {
        super();

        this.routes = {};
        this.paramRoutes = {};
        this.middlewares = [];

        if (this.root === "/")
            this.root = "";

        return new Proxy(this, {
            apply(target, _, args) {
                return target.cb(...args as [Server.Context, Server.NextFunction, ...any[]])
            }
        });
    }

    handle(route: string, handler: Router.RouteHandler) {
        if (route === "/" && this.root !== "")
            route = "";

        this.routes[this.root + route] = handler;
    }

    param(route: string, handler: Router.RouteHandler) {
        if (route === "/" && this.root !== "")
            route = "";

        this.paramRoutes[this.root + route] = handler;
    }

    use(...m: Server.Middleware[]) {
        for (const md of m) {
            if (md instanceof Router)
                md.root += this.root;

            this.middlewares.push(md);
        }
    }

    private searchMatch(url: string) {
        for (const key in this.paramRoutes) {
            const mtch = match(key)(url);

            if (mtch)
                return {
                    matches: key,
                    params: mtch.params,
                };
        };
    }

    private async runRoute(routeHandler: Router.RouteHandler, ctx: Server.Context) {
        // Run for all route
        if (typeof routeHandler.all === "function")
            await routeHandler.all(ctx);

        const routeMethodHandler = routeHandler[ctx.request.method.toLowerCase()];
        if (typeof routeMethodHandler === "function")
            await routeMethodHandler(ctx);
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
                await this.runRoute(routeHandler, ctx);
            else {
                const obj = this.searchMatch(ctx.request.url);

                if (obj) {
                    // @ts-ignore
                    ctx.request.params = obj.params;
                    await this.runRoute(this.paramRoutes[obj.matches], ctx);
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