const getBaseUrl = () => {
  if (process.env.BASE_URL) {
    return process.env.BASE_URL.replace(/\/$/, "");
  }
  if (process.env.WEBSITE_HOSTNAME) {
    return `https://${process.env.WEBSITE_HOSTNAME}`;
  }
  if (process.env.serviceUrl) {
    const derived = process.env.serviceUrl.replace(/\/api\/messages\/?$/i, "");
    if (derived.startsWith("http://") || derived.startsWith("https://")) {
      return derived.replace(/\/$/, "");
    }
  }
  return "";
};

const buildIncFileContentUrl = (fileUrl, fileName, download = false) => {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return null;
  }
  const params = new URLSearchParams({
    url: fileUrl,
    name: fileName || "file",
  });
  if (download) {
    params.set("download", "1");
  }
  return `${baseUrl}/viewfile/content?${params.toString()}`;
};

const buildIncFileAutoDownloadUrl = (fileUrl, fileName, fileSize) => {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    return null;
  }
  const params = new URLSearchParams({
    url: fileUrl,
    name: fileName || "file",
  });
  if (fileSize != null && String(fileSize).trim() !== "") {
    params.set("size", String(fileSize).trim());
  }
  return `${baseUrl}/viewfile/autodownload?${params.toString()}`;
};

const extractIncFileRequest = (taskModuleRequest) => {
  const candidates = [
    taskModuleRequest?.data,
    taskModuleRequest,
    taskModuleRequest?.action?.data,
    taskModuleRequest?.value,
    taskModuleRequest?.value?.data,
  ].filter(Boolean);

  for (const data of candidates) {
    const fileUrl =
      data.fileUrl || data.Blob || data.blob || data.blobdata || null;
    const fileName =
      data.fileName || data.File_name || data.name || data.filename || "file";
    const verb = data.verb;
    const isTaskFetch = data.msteams?.type === "task/fetch";

    if (fileUrl && verb === "download_inc_file") {
      return { fileUrl, fileName, verb };
    }
    if (fileUrl && isTaskFetch && verb === "download_inc_file") {
      return { fileUrl, fileName, verb };
    }
  }

  return null;
};

const buildIncFileTaskModuleTaskResponse = (fileUrl, fileName) => {
  const taskUrl = buildIncFileAutoDownloadUrl(fileUrl, fileName);

  if (!taskUrl) {
    return {
      task: {
        type: "message",
        value:
          "Download is not configured on the server. Please contact your administrator.",
      },
    };
  }

  return {
    task: {
      type: "continue",
      value: {
        type: "task",
        url: taskUrl,
        height: "small",
        width: "small",
        title: `Downloading ${fileName}`,
      },
    },
  };
};

const buildIncFileTaskModuleInvokeResponse = (fileUrl, fileName) => {
  return {
    status: 200,
    body: buildIncFileTaskModuleTaskResponse(fileUrl, fileName),
  };
};

const isAllowedFileViewUrl = (fileUrl) => {
  try {
    const parsed = new URL(fileUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    const allowedHosts = (process.env.ALLOWED_FILE_VIEW_HOSTS || "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
    if (allowedHosts.length === 0) {
      return true;
    }
    return allowedHosts.some(
      (host) =>
        parsed.hostname.toLowerCase() === host ||
        parsed.hostname.toLowerCase().endsWith(`.${host}`),
    );
  } catch (err) {
    return false;
  }
};

module.exports = {
  getBaseUrl,
  buildIncFileContentUrl,
  buildIncFileAutoDownloadUrl,
  extractIncFileRequest,
  buildIncFileTaskModuleTaskResponse,
  buildIncFileTaskModuleInvokeResponse,
  isAllowedFileViewUrl,
};
