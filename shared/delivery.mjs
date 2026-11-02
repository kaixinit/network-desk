import { zipSync, strToU8 } from "fflate";
import { prepareExport, reportHTML, validateRecord } from "./model.mjs";
import { VERSION } from "./version.mjs";

export async function deliveryArchive(input, masked = true, modules = null) {
  // Export once: every file in the archive uses this exact immutable snapshot.
  const record = validateRecord(prepareExport(input, masked, modules));
  const files = {
    "report.html": strToU8(reportHTML(record)),
    "report.json": strToU8(JSON.stringify(record, null, 2)),
    "使用说明.txt": strToU8(
      `Network Desk ${VERSION} 排查交付包\n\n记录编号：${record.id}\n更新于：${record.updatedAt}\n${record.redacted ? "已启用脱敏" : "包含完整 IP"}\n范围：${record.exportModules?.join("、") || "本次全部检测"}\n\nreport.html：双击离线阅读，包含结论、逐项证据和合并的系统信息。\nreport.json：在软件的报告中心导入，可继续查看与比较。ZIP 无需导入，先解压选择 JSON。\nSHA256SUMS.txt：文件校验值，用于核对文件完整性，不是来源认证或数字签名。\n\n未执行、失败和无法确定项目保留实际状态；摘要不能保证账号可用或免手机验证注册。\n脱敏不等于匿名：时间、地区、设备摘要和填写内容仍可能识别使用者，交付前请复核。\n导出不会修改系统代理设置。\n`,
    ),
  };
  const hashes = await Promise.all(
    Object.entries(files).map(async ([name, bytes]) => {
      const hash = await globalThis.crypto.subtle.digest("SHA-256", bytes);
      return (
        Array.from(new Uint8Array(hash), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join("") +
        "  " +
        name
      );
    }),
  );
  files["SHA256SUMS.txt"] = strToU8(hashes.join("\n") + "\n");
  return {
    bytes: zipSync(files, { level: 6 }),
    record,
    name:
      "NetworkDesk-delivery-" +
      record.id.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 36) +
      ".zip",
  };
}
