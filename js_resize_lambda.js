'use strict'

// Majority of code originally from : https://docs.aws.amazon.com/lambda/latest/dg/with-s3-example.html 

const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const moment = require('moment');
const fileType = require('file-type');
const async = require('async');
// Enable ImageMagick integration.
const gm = require('gm')
            .subClass({ imageMagick: true }); 
const util = require('util');

exports.handler = function(event, context, callback){

  var srcBucket = event.Records[0].s3.bucket.name;
  // Object key may have spaces or unicode non-ASCII characters.
  var srcKey    =
  decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));
  var imgName = srcKey.slice(9);  
  var dstKey    = "thumbnails/" + imgName;
  console.log("\nsrcKey", srcKey);
  console.log("\nimgName", imgName);
  console.log("\ndstKey", dstKey);
  
  // Infer the image type.
  var typeMatch = srcKey.match(/\.([^.]*)$/);
  if (!typeMatch) {
      callback("Could not determine the image type.");
      return;
  }
  var imageType = typeMatch[1].toLowerCase();
  if (imageType != "jpg" && imageType != "png") {
      callback(`Unsupported image type: ${imageType}`);
      return;
  }

  // Download the image from S3, transform, and upload to a different S3 bucket.
  async.waterfall([
    function download(next) {
        // Download the image from S3 into a buffer.
        s3.getObject({
                Bucket: srcBucket,
                Key: srcKey
            },
            next);
        },
    function transform(response, next) {
        gm(response.Body).size(function(err, size) {
            // Infer the scaling factor to avoid stretching the image unnaturally.
            var scalingFactor = Math.min(
                50 / size.width,
                50 / size.height
            );
            var width  = scalingFactor * size.width;
            var height = scalingFactor * size.height;

            // Transform the image buffer in memory.
            this.resize(width, height)
                .toBuffer(imageType, function(err, buffer) {
                    if (err) {
                        next(err);
                    } else {
                        next(null, response.ContentType, buffer);
                    }
                });
        });

      },
      function upload(contentType, data, next) {
          // Stream the transformed image to a different S3 bucket.
          s3.putObject({
                  Bucket: srcBucket,
                  Key: dstKey,
                  Body: data,
                  ContentType: contentType
              },
              next);
          }
      ], function (err) {
          if (err) {
              console.error(
                  'Unable to resize ' + srcBucket + '/' + srcKey +
                  ' and upload to ' + srcBucket + '/' + dstKey +
                  ' due to an error: ' + err
              );
          } else {
              console.log(
                  'Successfully resized ' + srcBucket + '/' + srcKey +
                  ' and uploaded to ' + srcBucket + '/' + dstKey
              );
          }

          callback(null, "message");
      }
  );
}

