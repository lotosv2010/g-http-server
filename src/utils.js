exports.byteToSize = (byte) => {
  if (byte === 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const unitIndex = Math.floor(Math.log(byte) / Math.log(1024));
  return `${(byte / 1024 ** unitIndex).toFixed(2)} ${units[unitIndex]}`;
}

/**
 * 格式化文件/文件夹权限
 * @param {number} mode 文件的 mode 值（如 33188）
 * @returns {string} 权限字符串，例如 "-rw-r--r--"
 */
exports.getPermissionString = (mode) => {
  // 判断是否是文件或目录
  const type = (mode & 0o40000) ? 'd' : '-';
  
  // 将权限转换为 rwx 格式
  const owner = ((mode & 0o400) ? 'r' : '-') + ((mode & 0o200) ? 'w' : '-') + ((mode & 0o100) ? 'x' : '-');
  const group = ((mode & 0o040) ? 'r' : '-') + ((mode & 0o020) ? 'w' : '-') + ((mode & 0o010) ? 'x' : '-');
  const others = ((mode & 0o004) ? 'r' : '-') + ((mode & 0o002) ? 'w' : '-') + ((mode & 0o001) ? 'x' : '-');
  
  return type + owner + group + others;
}
