const {
  buildIncFileAutoDownloadUrl,
  buildIncFileContentUrl,
} = require("./incidentFileViewer");

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".bmp",
]);

const DOCUMENT_STYLES = {
  ".pdf": {
    label: "PDF",
    labelColor: "Attention",
    iconColor: "%23D93831",
    actionTitle: "Open PDF",
  },
  ".doc": {
    label: "Word",
    labelColor: "Accent",
    iconColor: "%232B579A",
    actionTitle: "Open document",
  },
  ".docx": {
    label: "Word",
    labelColor: "Accent",
    iconColor: "%232B579A",
    actionTitle: "Open document",
  },
  ".txt": {
    label: "Text",
    labelColor: "Default",
    iconColor: "%23606770",
    actionTitle: "Open file",
  },
  ".xls": {
    label: "Excel",
    labelColor: "Good",
    iconColor: "%231D6F42",
    actionTitle: "Open spreadsheet",
  },
  ".xlsx": {
    label: "Excel",
    labelColor: "Good",
    iconColor: "%231D6F42",
    actionTitle: "Open spreadsheet",
  },
  ".ppt": {
    label: "PowerPoint",
    labelColor: "Attention",
    iconColor: "%23D24726",
    actionTitle: "Open presentation",
  },
  ".pptx": {
    label: "PowerPoint",
    labelColor: "Attention",
    iconColor: "%23D24726",
    actionTitle: "Open presentation",
  },
};

const DEFAULT_DOCUMENT_STYLE = {
  label: "File",
  labelColor: "Default",
  iconColor: "%23606770",
  actionTitle: "Open file",
};

const getIncFileName = (incFile) => {
  return incFile.File_name || incFile.name || incFile.filename || "Attachment";
};

const getFileExtension = (fileName) => {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex === -1) {
    return "";
  }
  return fileName.slice(dotIndex).toLowerCase();
};

const isImageAttachment = (fileName) => {
  return IMAGE_EXTENSIONS.has(getFileExtension(fileName));
};

const getDocumentStyle = (extension) => {
  return DOCUMENT_STYLES[extension] || DEFAULT_DOCUMENT_STYLE;
};

const buildDownloadAction = (incFile, fileName) => {
  const fileSize = incFile.File_size || incFile.file_size || null;
  const downloadUrl =
    buildIncFileAutoDownloadUrl(incFile.Blob, fileName, fileSize) ||
    buildIncFileContentUrl(incFile.Blob, fileName, true) ||
    incFile.Blob;

  return {
    type: "Action.OpenUrl",
    title: "Download",
    url: downloadUrl,
    msTeams: {
      openUrl: {
        type: "openExternal",
      },
    },
  };
};

const buildDocumentIconDataUri = (label, iconColor) => {
  const safeLabel = label.slice(0, 4).toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='48' viewBox='0 0 40 48'><path d='M8 2h18l10 10v34a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z' fill='${iconColor}'/><path d='M26 2v10h10' fill='none' stroke='white' stroke-width='1.5' opacity='0.7'/><text x='20' y='31' text-anchor='middle' fill='white' font-size='9' font-weight='bold' font-family='Segoe UI, Arial, sans-serif'>${safeLabel}</text></svg>`;
  return `data:image/svg+xml;utf8,${svg}`;
};

const buildDocumentCardItem = (incFile, fileName) => {
  const extension = getFileExtension(fileName);
  const style = getDocumentStyle(extension);
  const fileSize = incFile.File_size || incFile.file_size || null;
  const downloadAction = buildDownloadAction(incFile, fileName);

  const detailsColumnItems = [
    {
      type: "TextBlock",
      text: style.label,
      weight: "Bolder",
      color: style.labelColor,
      size: "Small",
      spacing: "None",
    },
    {
      type: "TextBlock",
      text: fileName,
      wrap: true,
      weight: "Bolder",
      spacing: "Small",
    },
  ];

  if (fileSize) {
    detailsColumnItems.push({
      type: "TextBlock",
      text: fileSize,
      size: "Small",
      isSubtle: true,
      spacing: "Small",
    });
  }

  return {
    type: "Container",
    style: "emphasis",
    bleed: true,
    spacing: "Medium",
    items: [
      {
        type: "ColumnSet",
        columns: [
          {
            type: "Column",
            width: "auto",
            items: [
              {
                type: "Image",
                url: buildDocumentIconDataUri(style.label, style.iconColor),
                size: "Medium",
              },
            ],
            verticalContentAlignment: "Center",
          },
          {
            type: "Column",
            width: "stretch",
            items: detailsColumnItems,
            verticalContentAlignment: "Center",
          },
        ],
      },
      {
        type: "ActionSet",
        spacing: "Small",
        actions: [downloadAction],
      },
    ],
  };
};

const buildIncFileCardItem = (incFile) => {
  const fileName = getIncFileName(incFile);
  if (isImageAttachment(fileName)) {
    return {
      type: "Image",
      url: incFile.Blob,
      msTeams: {
        allowExpand: true,
      },
    };
  }
  return buildDocumentCardItem(incFile, fileName);
};

const buildIncFilesCardBody = (incFilesData) => {
  const cardBody = [];
  if (incFilesData.length === 1) {
    cardBody.push(buildIncFileCardItem(incFilesData[0]));
  } else {
    let columns = [];
    incFilesData.forEach((incFile, index) => {
      if (index % 2 === 0) {
        columns = [];
        cardBody.push({
          type: "ColumnSet",
          columns: columns,
        });
      }
      columns.push({
        type: "Column",
        width: "stretch",
        items: [buildIncFileCardItem(incFile)],
      });
    });
  }
  return cardBody;
};

module.exports = {
  getIncFileName,
  getFileExtension,
  isImageAttachment,
  buildIncFileCardItem,
  buildIncFilesCardBody,
};
