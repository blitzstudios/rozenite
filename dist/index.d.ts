import { Application } from 'express';
import { IncomingMessage } from 'node:http';
import { ProjectType } from '@rozenite/tools';
import { RozeniteHostIntegration } from '@rozenite/tools';
import { ServerResponse } from 'node:http';

export declare const createScopedMiddleware: (prefix: string, middleware: MiddlewareHandler) => MiddlewareHandler;

export declare const initializeRozenite: (options: RozeniteConfig, runtimeVersion?: string) => Promise<RozeniteInstance>;

export declare type MiddlewareHandler = (req: MiddlewareRequest, res: ServerResponse, next: MiddlewareNext) => void;

export declare type MiddlewareNext = (error?: unknown) => void;

export declare type MiddlewareRequest = IncomingMessage & {
    url?: string;
};

export declare type RozeniteConfig = {
    projectRoot: string;
    include?: string[];
    exclude?: string[];
    /**
     * Plugin identifiers that should NOT maintain their UI state when not active.
     * These panels will be destroyed instead of hidden when switching between panels.
     * If not provided (default), all plugins will persist their state.
     */
    destroyOnDetachPlugins?: string[];
    /**
     * Project type of the project. If not provided, Rozenite will try to guess it based on the project root.
     * Useful if built-in heuristics fail to detect the project type.
     */
    projectType?: ProjectType;
    /**
     * The log level to use.
     * @default 'info'
     */
    logLevel?: RozeniteLogLevel;
    /**
     * How Rozenite plugins are shown in React Native DevTools.
     *
     * @default 'sidebar'
     */
    pluginDisplay?: RozenitePluginDisplay;
    /**
     * Which host this dev server serves.
     *
     * `react-native` (the default) resolves React Native and serves the
     * Fusebox debugger frontend. `lynx` skips every React Native lookup:
     * Lynx apps have no `react-native` dependency, and `@rozenite/app` is
     * loaded standalone there rather than embedded in Fusebox's HTML.
     *
     * Named `integration`, not `platform`: `platform` means the device OS
     * everywhere else in this system, so reusing it here would collide —
     * especially in `resolveIntegration` (`@rozenite/tools`), which combines
     * this value with what the connected device reports about itself to
     * answer "which integration is this target".
     *
     * @default 'react-native'
     */
    integration?: RozeniteHostIntegration;
};

export declare type RozeniteInstance = {
    middleware: RozeniteMiddleware;
    devModePackage: {
        name: string;
        path: string;
    } | null;
    dispose: () => Promise<void>;
};

declare type RozeniteLogLevel = 'none' | 'error' | 'warn' | 'info' | 'debug';

export declare type RozeniteMiddleware = Application;

/** Controls whether plugins are shown as individual tabs or in one sidebar. */
export declare type RozenitePluginDisplay = 'tabs' | 'sidebar';

export { }
