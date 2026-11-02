using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("Network Desk Portable")]
[assembly: AssemblyProduct("Network Desk")]
[assembly: AssemblyDescription("网络诊断台免安装启动器")]
[assembly: AssemblyCompany("Network Desk contributors")]
[assembly: AssemblyVersion("1.2.12.0")]
[assembly: AssemblyFileVersion("1.2.12.0")]

internal static class Launcher
{
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr FindWindow(string className, string title);
    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr window);

    [STAThread]
    private static int Main()
    {
        bool created;
        // Acquire before extracting: Electron's own lock is too late for a
        // portable archive that uses a stable extraction directory.
        using (var gate = new Mutex(true, @"Local\NetworkDesk.Portable.Launcher.V1", out created))
        {
            if (!created)
            {
                IntPtr window = FindWindow(null, "网络诊断台 · Network Desk");
                if (window != IntPtr.Zero)
                {
                    if (IsIconic(window)) ShowWindow(window, 9);
                    SetForegroundWindow(window);
                }
                else MessageBox.Show("网络诊断台正在启动，请稍候。", "Network Desk");
                return 0;
            }
            string directory = null;
            string payload = null;
            try
            {
                string temp = Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
                directory = Path.GetFullPath(Path.Combine(temp, "NetworkDeskLauncher-" + Guid.NewGuid().ToString("N")));
                if (!directory.StartsWith(temp, StringComparison.OrdinalIgnoreCase)) throw new IOException("临时目录无效");
                Directory.CreateDirectory(directory);
                payload = Path.Combine(directory, "NetworkDesk-runtime.exe");
                using (Stream source = Assembly.GetExecutingAssembly().GetManifestResourceStream("NetworkDesk.Payload"))
                using (var output = new FileStream(payload, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                {
                    if (source == null) throw new IOException("缺少内置运行文件");
                    source.CopyTo(output);
                }
                using (Process child = Process.Start(new ProcessStartInfo(payload) {
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WorkingDirectory = directory
                }))
                {
                    child.WaitForExit();
                    return child.ExitCode;
                }
            }
            catch (Exception error)
            {
                MessageBox.Show("无法启动网络诊断台：" + error.Message, "Network Desk", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
            finally
            {
                // Remove only the file and empty directory created by this run.
                try { if (payload != null) File.Delete(payload); } catch (IOException) {} catch (UnauthorizedAccessException) {}
                try { if (directory != null) Directory.Delete(directory, false); } catch (IOException) {} catch (UnauthorizedAccessException) {}
                gate.ReleaseMutex();
            }
        }
    }
}
