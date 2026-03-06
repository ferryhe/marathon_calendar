export function getFriendlyErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  // Map common API errors to Chinese, keep fallback as-is for debugging.
  switch (message) {
    case "Invalid credentials":
      return "用户名或密码错误";
    case "Username already exists":
      return "用户名已存在，请换一个";
    case "Authentication required":
      return "请先登录";
    default:
      return message;
  }
}

