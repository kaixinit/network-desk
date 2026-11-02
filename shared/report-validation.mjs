// Imported JSON is untrusted. Bound its complexity before cloning or rendering.
export function boundedJSON(value, limit) {
  const pending = [[value, 0]];
  let count = 0;
  while (pending.length) {
    const [item, depth] = pending.pop();
    if (++count > 100_000 || depth > 32)
      throw new Error("报告嵌套过深或字段过多");
    if (item && typeof item === "object") {
      if (
        !Array.isArray(item) &&
        Object.getPrototypeOf(item) !== Object.prototype
      )
        throw new Error("报告必须为 JSON 数据");
      const values = Object.values(item);
      if (count + pending.length + values.length > 100_000)
        throw new Error("报告字段过多");
      for (const child of values) pending.push([child, depth + 1]);
    } else if (
      item !== null &&
      !["string", "number", "boolean"].includes(typeof item)
    )
      throw new Error("报告必须为 JSON 数据");
  }
  const text = JSON.stringify(value);
  if (text.length > limit) throw new Error("报告过大");
  return JSON.parse(text);
}

const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
function fields(value, names, type = "string") {
  for (const name of names.split(" "))
    if (
      value?.[name] != null &&
      (typeof value[name] !== type ||
        (type === "number" && !Number.isFinite(value[name])))
    )
      throw new Error(`报告字段 ${name} 类型无效`);
}
function items(value, name, check) {
  if (value?.[name] == null) return;
  if (!Array.isArray(value[name]))
    throw new Error(`报告字段 ${name} 必须为数组`);
  for (const item of value[name]) check(item);
}
function itemObject(value) {
  if (!object(value)) throw new Error("报告列表项必须为对象");
}
function httpsLink(value) {
  if (value == null || value === "") return;
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("报告外部链接无效");
  }
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("报告外部链接仅允许无凭据的 HTTPS 地址");
}

export function validateObservationData(key, data) {
  if (data == null) return;
  if (key === "status") {
    items({ services: data }, "services", (s) => {
      itemObject(s);
      if (typeof s.name !== "string") throw new Error("服务名称无效");
      fields(s, "id name category error page checkedAt");
      fields(s, "ok", "boolean");
      httpsLink(s.page);
      if (s.ok && !object(s.data)) throw new Error("服务状态数据无效");
      fields(s.data?.status, "indicator description");
      fields(s.data?.page, "updated_at");
      items(s.data, "incidents", (x) => {
        itemObject(x);
        fields(x, "id name status updated_at");
        items(x, "incident_updates", (up) => {
          itemObject(up);
          fields(up, "id body");
        });
      });
      items(s.data, "components", itemObject);
    });
    return;
  }
  // Unknown module evidence remains intact; only fields consumed by the UI are typed.
  if (
    !/^(environment$|webrtc(?:$|:)|global-ping$|egress:|risk:|link:|dns|cf-|region:|news:)/.test(
      key,
    )
  )
    return;
  if (!object(data)) throw new Error("检测数据必须为对象或空值");
  fields(
    data,
    "ip requestedIp returnedIp country countryCode city region asn organization reason source action",
  );
  fields(data, "elapsedMs httpStatus rounds queries completedRounds", "number");
  fields(
    data,
    "match hosting residential vpn proxy tor crawler abuse applicable disabled",
    "boolean",
  );
  if (
    data.score != null &&
    (!Number.isFinite(data.score) || data.score < 0 || data.score > 100)
  )
    throw new Error("报告评分必须在 0–100 之间");
  fields(data.trace, "colo http");
  if (key === "environment")
    fields(
      data,
      "os platform browserName browserVersion screen language timezone renderer gpu",
    );
  if (key.startsWith("risk:"))
    fields(data.raw, "registered_country_code countryCode");
  items(data, "candidates", (x) => {
    itemObject(x);
    fields(x, "type address");
  });
  items(data, "samples", itemObject);
  items(data, "resolvers", (x) => {
    if (typeof x !== "string") throw new Error("解析器地址无效");
  });
  if (key === "global-ping") items(data, "results", itemObject);
  if (key.startsWith("news:"))
    items(data, "entries", (x) => {
      itemObject(x);
      if (typeof x.title !== "string") throw new Error("资讯标题无效");
      fields(x, "title url date");
      httpsLink(x.url);
    });
}
