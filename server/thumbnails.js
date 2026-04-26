const path = require("path");
const sharp = require("sharp");
const ffmpegPath = require("ffmpeg-static");
const ffmpeg = require("fluent-ffmpeg");

ffmpeg.setFfmpegPath(ffmpegPath);

function makeThumbnailName(id) {
  return `${id}.jpg`;
}

async function generateImageThumbnail(inputPath, outputPath) {
  await sharp(inputPath).resize(400, 225, { fit: "cover" }).jpeg({ quality: 80 }).toFile(outputPath);
}

function generateVideoThumbnail(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .on("end", resolve)
      .on("error", reject)
      .screenshots({
        timestamps: ["00:00:01.000"],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: "400x225",
      });
  });
}

module.exports = {
  makeThumbnailName,
  generateImageThumbnail,
  generateVideoThumbnail,
};
