import Server from "@pxe/server";

interface Router extends Server.Middleware { }

declare namespace Router {
    export interface RouteHandler {
        /**
         * GET method handler
         * @param ctx 
         */
        get(ctx: Server.Context): Promise<void> | void;

        /**
         * POST method handler
         * @param ctx 
         */
        post(ctx: Server.Context): Promise<void> | void;

        /**
         * PUT method handler
         * @param ctx 
         */
        put(ctx: Server.Context): Promise<void> | void;

        /**
         * DELETE method handler
         * @param ctx 
         */
        delete(ctx: Server.Context): Promise<void> | void;

        /**
         * HEAD method handler
         * @param ctx 
         */
        head(ctx: Server.Context): Promise<void> | void;

        /**
         * CONNECT method handler
         * @param ctx 
         */
        connect(ctx: Server.Context): Promise<void> | void;

        /**
         * OPTIONS method handler
         * @param ctx 
         */
        options(ctx: Server.Context): Promise<void> | void;

        /**
         * TRACE method handler
         * @param ctx 
         */
        trace(ctx: Server.Context): Promise<void> | void;

        /**
         * PATCH method handler
         * @param ctx 
         */
        patch(ctx: Server.Context): Promise<void> | void;

        /**
         * All method handler
         * @param ctx 
         */
        all(ctx: Server.Context): Promise<void> | void;
    }
}

class Router extends Function {
    private readonly routes: {
        [routeName: string]: Router.RouteHandler;
    };

    private readonly middlewares: Server.Middleware[];

    /**
     * Create a router middleware
     * @param root root path
     */
    constructor(private readonly root: string = "/") {
        super();

        this.routes = {};
        this.middlewares = [];

        if (this.root === "/")
            this.root = "";

        return new Proxy(this, {
            apply(target, _, args) {
                return target.cb(...args as [Server.Context, Server.NextFunction, ...any[]])
            }
        });
    }

    /**
     * Handle a route
     * @param route 
     * @param handler 
     */
    handle(route: string, handler: Router.RouteHandler) {
        this.routes[this.root + route] = handler;
    }

    /**
     * Add middlewares
     * @param m 
     */
    use(...m: Server.Middleware[]) {
        this.middlewares.push(...m);
    }

    /**
     * The callback of this middleware
     * @param ctx 
     * @param next 
     * @param args 
     */
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
            if (routeHandler) {
                // Run for all route
                if (typeof routeHandler.all === "function")
                    await routeHandler.all(ctx);

                const routeMethodHandler = routeHandler[ctx.request.method.toLowerCase()];
                if (typeof routeMethodHandler === "function")
                    await routeMethodHandler(ctx);
            }
        }
        if (ctx.request.url.startsWith(this.root))
            await runMiddleware(0);

        // Next middleware
        await next(...args);
    }
}

export = Router;