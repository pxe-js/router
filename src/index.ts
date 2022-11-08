import Server from "@pxe/server";
import Trouter, { Methods } from "trouter";
import { Context } from "@pxe/server";

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

// Normalize the input route name
function normalize(route: string) {
    if (route.startsWith("/"))
        route = route.substring(1);
    return route;
}

// Main class 
class Router extends Function {
    private readonly routes: Trouter<(ctx: Context) => Promise<void> | void>;
    private readonly middlewares: Server.Middleware[];

    constructor(private root?: string) {
        super();

        if (!root)
            this.root = "/";
        else
            this.root = root;

        if (!this.root.endsWith("/"))
            this.root += "/";

        this.routes = new Trouter();
        this.middlewares = [];

        return new Proxy(this, {
            apply(target, _, args) {
                return target.cb(...args as [Server.Context, Server.NextFunction, ...any[]])
            }
        });
    }

    handle(route: string, handler: Router.RouteHandler) {
        for (const method in handler) 
            this.routes.add(
                method.toUpperCase() as Methods, 
                this.root + normalize(route), 
                handler[method]
            );
    }

    use(...m: Server.Middleware[]) {
        for (const md of m) {
            if (md instanceof Router)
                md.root += this.root;

            this.middlewares.push(md);
        }
    }

    async runMiddleware(i: number, ctx: Context, ...a: any[]) {
        const currentMiddleware = this.middlewares[i];

        // Run the next middleware
        if (i < this.middlewares.length && typeof currentMiddleware === "function")
            return currentMiddleware(
                // @ts-ignore
                ctx,
                async (...args: any[]) => this.runMiddleware(i + 1, ctx, ...args),
                ...a
            );

        // Run routes after running all the middlewares
        const route = this.routes.find(ctx.request.method, ctx.request.url);
        ctx.params = route.params;
        for (const handler of route.handlers)
            await handler(ctx);
    }

    async cb(ctx: Server.Context, next: Server.NextFunction, ...args: any[]) {
        if (ctx.request.url.startsWith(this.root))
            await ctx.runMiddleware(0, ctx);

        // Next middleware
        await next(...args);
    }
}

export = Router;