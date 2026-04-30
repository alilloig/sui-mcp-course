export interface ProbeResult {
  pass: boolean;
  message: string;
  action?: undefined;
}

export async function probe(): Promise<ProbeResult> {
  const version = process.version;
  const match = /^v(\d+)\./.exec(version);
  const major = match ? parseInt(match[1], 10) : 0;

  if (major >= 18) {
    return {
      pass: true,
      message: `Node.js ${version} is supported (>= 18).`,
    };
  }

  return {
    pass: false,
    message: `Node.js ${version} is below the required minimum (18). Please upgrade to Node.js 18 or later.`,
  };
}
