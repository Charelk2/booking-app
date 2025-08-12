const handler: ProxyHandler<any> = {
  get: (target, prop) => {
    if (!(prop in target)) {
      target[prop] = jest.fn();
    }
    return target[prop];
  },
};

const api: any = new Proxy(
  { getServiceCategories: jest.fn().mockResolvedValue({ data: [] }) },
  handler,
);

module.exports = api;
