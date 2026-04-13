export const pluginManager = {
  plugins: [],
  register: (plugin) => {
    pluginManager.plugins.push(plugin);
    console.log('Registered plugin: ' + plugin.name);
  },
  execute: async (hook, context) => {
    for (const plugin of pluginManager.plugins) {
      if (plugin.hooks[hook]) {
        await plugin.hooks[hook](context);
      }
    }
  }
};
