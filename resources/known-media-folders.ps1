# Resolve Windows' current per-user folders, including local redirections.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class GlintKnownFolders {
    [DllImport("shell32.dll")]
    private static extern int SHGetKnownFolderPath(ref Guid id, uint flags, IntPtr token, out IntPtr path);
    public static string Path(string folder) {
        Guid id = new Guid(folder);
        IntPtr path;
        int result = SHGetKnownFolderPath(ref id, 0, IntPtr.Zero, out path);
        try { return result == 0 ? Marshal.PtrToStringUni(path) : null; }
        finally { Marshal.FreeCoTaskMem(path); }
    }
}
'@
@{
    captures = [GlintKnownFolders]::Path('edc0fe71-98d8-4f4a-b920-c8dc133cb165')
    screenshots = [GlintKnownFolders]::Path('b7bede81-df94-4682-a7d8-57a52620b86f')
} | ConvertTo-Json -Compress
