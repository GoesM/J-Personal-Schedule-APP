Option Explicit
Dim fs, root, stream, relative, target, shell
Set fs = CreateObject("Scripting.FileSystemObject")
root = fs.GetParentFolderName(WScript.ScriptFullName)
Set stream = fs.OpenTextFile(fs.BuildPath(root, "current-version.txt"), 1, False, -1)
relative = Trim(stream.ReadAll)
stream.Close
If InStr(relative, "..") > 0 Or InStr(relative, ":") > 0 Then WScript.Quit 1
target = fs.BuildPath(root, relative)
If Not fs.FileExists(target) Then
  MsgBox "Application files are missing. Please restore the release folder.", 48, "J Schedule"
  WScript.Quit 1
End If
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = fs.GetParentFolderName(target)
shell.Run Chr(34) & target & Chr(34), 1, False
