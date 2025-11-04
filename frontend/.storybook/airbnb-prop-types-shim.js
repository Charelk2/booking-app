import pkg from 'airbnb-prop-types';

// Re-export named helpers expected by ESM consumers.
// Many bundlers support default-importing CommonJS; using a small shim
// ensures named imports like `forbidExtraProps` are available.
export const forbidExtraProps = pkg.forbidExtraProps;
export const forbidExtraPropsFactory = pkg.forbidExtraPropsFactory;

export default pkg;
