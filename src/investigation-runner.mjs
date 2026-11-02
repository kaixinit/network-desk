import { canonicalIP, validateSystem } from "../shared/model.mjs";
import { investigationPlan } from "../shared/investigation.mjs";

// Generation guards prevent a cancelled or replaced run from writing into another report.
export async function runInvestigation(
  d,
  checks,
  scopes,
  { includeSystem = false, collectSystem } = {},
) {
  if (d.recordRef.current.investigation?.state === "running") return;
  const plan = investigationPlan(scopes, includeSystem);
  d.startRecord("investigation", "网络环境综合排查");
  const gen = d.generation.current;
  const active = () => gen === d.generation.current;
  const patch = (changes) => {
    if (active())
      d.patchRecord({
        investigation: { ...d.recordRef.current.investigation, ...changes },
      });
  };
  d.patchRecord({
    investigation: {
      version: 1,
      scopes: plan.selected,
      includeSystem,
      state: "running",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      plannedKeys: plan.keys,
    },
  });
  async function batch(jobs) {
    let next = 0;
    const errors = [];
    await Promise.all(
      Array.from({ length: Math.min(4, jobs.length) }, async () => {
        while (active() && next < jobs.length) {
          try {
            await jobs[next++]();
          } catch (e) {
            errors.push(e);
          }
        }
      }),
    );
    if (errors.length) throw errors[0];
  }
  try {
    const basics = [
      () => checks.environment(),
      ...plan.exits.map((t) => () => checks.exit(t)),
    ];
    if (includeSystem)
      basics.push(() =>
        d.task(
          "system:collection",
          "系统信息采集",
          async () => {
            if (!collectSystem)
              return {
                status: "unknown",
                summary: "网页版需手动导入系统 JSON",
                source: "本机只读脚本",
                execution: "system-script",
              };
            const system = validateSystem(await collectSystem());
            if (active()) d.patchRecord({ system, assessmentSnapshot: null });
            return {
              status: "ok",
              summary: "只读系统信息已合并",
              source: "本机只读脚本",
              execution: "system-script",
              data: { collectedAt: system.collectedAt },
            };
          },
          { source: "本机只读脚本", execution: "system-script" },
        ),
      );
    await batch(basics);
    if (!active()) return;
    const ips = [
      ...new Set(
        plan.exits
          .map((t) =>
            canonicalIP(d.recordRef.current.results["egress:" + t]?.data?.ip),
          )
          .filter(Boolean),
      ),
    ];
    patch({ plannedKeys: [...plan.keys, ...ips.map((ip) => "risk:" + ip)] });
    const preferred =
      d.recordRef.current.results["egress:ipv4"]?.data?.ip || null;
    d.setSelected(preferred || "");
    await batch([
      ...ips.map((ip) => () => checks.risk(ip)),
      ...plan.links.map((t) => () => checks.connectivity(t)),
      () => checks.dns(),
      () => checks.rtc(preferred),
    ]);
    if (!active()) return;
    await batch(
      plan.regions.map((platform) => async () => {
        const exit =
          d.recordRef.current.results[
            "egress:" + (platform === "gpt" ? "chatgpt" : "claude")
          ];
        const ip = canonicalIP(exit?.data?.ip);
        const intel = d.recordRef.current.results["risk:" + ip]?.data;
        if (intel?.match && intel.countryCode)
          await checks.region(platform, intel.countryCode);
        else
          await d.task(
            "region:" + platform,
            platform === "gpt"
              ? "GPT 官方支持地区核验"
              : "Claude 官方支持地区核验",
            async () => ({
              status: "unknown",
              summary: "该平台出口缺少已核验的地区，无法判断支持范围",
              source: "本次平台出口与 IP 情报",
              execution: "local-service",
              target: ip,
            }),
          );
      }),
    );
    patch({ state: "completed", finishedAt: new Date().toISOString() });
  } catch (e) {
    patch({ state: "interrupted", finishedAt: new Date().toISOString() });
    if (active()) d.setNotice("综合排查中断，已有结果已保留：" + e.message);
  } finally {
    if (active()) d.save();
  }
}
