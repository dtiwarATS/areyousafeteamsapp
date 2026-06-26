const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".bmp",
]);

const getIncFileName = (incFile) => {
  return incFile.File_name || incFile.name || incFile.filename || "Attachment";
};

const isImageAttachment = (fileName) => {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex === -1) {
    return false;
  }
  return IMAGE_EXTENSIONS.has(fileName.slice(dotIndex).toLowerCase());
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
  return {
    type: "ActionSet",
    actions: [
      {
        type: "Action.OpenUrl",
        title: fileName,
        url: incFile.Blob,
      },
    ],
  };
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
        items: [buildIncFileCardItem(incFile)],
      });
    });
  }
  return cardBody;
};

module.exports = {
  getIncFileName,
  isImageAttachment,
  buildIncFileCardItem,
  buildIncFilesCardBody,
};
