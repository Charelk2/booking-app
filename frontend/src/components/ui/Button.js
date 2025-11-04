'use client';
"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("react");
const clsx_1 = require("clsx");
const buttonVariants_1 = require("@/styles/buttonVariants");
const analytics_1 = require("@/lib/analytics");
const Button = (0, react_1.forwardRef)((_a, ref) => {
    var _b;
    var { variant = 'primary', size = 'md', isLoading = false, fullWidth = false, className, children, analyticsEvent, analyticsProps, onClick } = _a, props = __rest(_a, ["variant", "size", "isLoading", "fullWidth", "className", "children", "analyticsEvent", "analyticsProps", "onClick"]);
    const sizeClass = size === 'sm'
        ? 'px-3 py-1.5 text-sm'
        : 'px-4 py-2 text-sm';
    const base = 'inline-flex items-center justify-center rounded-lg font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 motion-safe:transition-transform motion-safe:transition-colors motion-safe:active:scale-95 motion-reduce:transition-none motion-reduce:transform-none min-h-12 min-w-12';
    const variantClass = buttonVariants_1.buttonVariants[variant];
    const handleClick = (e) => {
        if (analyticsEvent)
            (0, analytics_1.trackEvent)(analyticsEvent, analyticsProps);
        onClick === null || onClick === void 0 ? void 0 : onClick(e);
    };
    return (react_1.default.createElement("button", Object.assign({ type: (_b = props.type) !== null && _b !== void 0 ? _b : 'button', "aria-busy": isLoading, disabled: isLoading || props.disabled, ref: ref }, props, { onClick: handleClick, className: (0, clsx_1.default)(base, sizeClass, variantClass, fullWidth && 'w-full', className) }),
        isLoading && (react_1.default.createElement("span", { className: "mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent", "aria-hidden": "true" })),
        react_1.default.createElement("span", { className: (0, clsx_1.default)(isLoading && 'opacity-75') }, children)));
});
Button.displayName = 'Button';
exports.default = Button;
