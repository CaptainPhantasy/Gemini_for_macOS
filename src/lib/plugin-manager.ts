interface Plugin {
  name: string;
  hooks: Record<string, (context: Record<string, unknown>) => Promise<void>>;
}

export const pluginManager = {
  plugins: [] as Plugin[],
  register: (plugin: Plugin) => {
    pluginManager.plugins.push(plugin);
    console.log('Registered plugin: ' + plugin.name);
  },
  execute: async (hook: string, context: Record<string, unknown>) => {
    for (const plugin of pluginManager.plugins) {
      if (plugin.hooks[hook]) {
        await plugin.hooks[hook](context);
      }
    }
  }
};