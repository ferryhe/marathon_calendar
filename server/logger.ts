export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export function logError(message: string, error?: Error | unknown, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  const timestamp = `${formattedTime} [${source}]`;
  
  if (error instanceof Error) {
    console.error(`${timestamp} ERROR: ${message}`);
    console.error(`${timestamp} Error details:`, {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
  } else {
    console.error(`${timestamp} ERROR: ${message}`);
    console.error(`${timestamp} Error details:`, error);
  }
}
