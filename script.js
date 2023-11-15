var region = "us-east-1";
var accessKeyId = "AKIARJQTUCEJCXUTS5YK";
var secretAccessKey = "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";

AWS.config.update({
    region: region,
    credentials: new AWS.Credentials(accessKeyId, secretAccessKey)
});

var s3 = new AWS.S3();

function refreshFileList(bucketname) {
    var tableBody = document.querySelector("#fileTable tbody");
    tableBody.innerHTML = "";

    s3.listObjectsV2({ Bucket: bucketname }, (err, data) => {
        if (err) {
            console.log("Error fetching file list", err);
        } else {
            data.Contents.forEach((object) => {
                var fileRow = document.createElement('tr');

                var fileNameCell = document.createElement('td');
                fileNameCell.textContent = object.Key;
                fileRow.appendChild(fileNameCell);

                var fileSizeCell = document.createElement("td");
                fileSizeCell.textContent = object.Size;
                fileRow.appendChild(fileSizeCell);

                var downloadCell = document.createElement('td');
                var downloadLink = document.createElement('a');

                // Generate a pre-signed URL with the 'response-content-disposition' parameter
                var params = {
                    Bucket: bucketname,
                    Key: object.Key,
                    ResponseContentDisposition: 'attachment; filename="' + object.Key + '"'
                };

                downloadLink.href = s3.getSignedUrl("getObject", params);
                downloadLink.textContent = "Download";

                downloadCell.appendChild(downloadLink);
                fileRow.appendChild(downloadCell);

                var deleteCell = document.createElement('td');
                var deleteButton = document.createElement('button');
                deleteButton.textContent = "Delete";
                deleteButton.addEventListener('click', () => {
                    deleteFile(bucketname, object.Key); // Pass object.Key as the parameter
                });

                deleteCell.appendChild(deleteButton);
                fileRow.appendChild(deleteCell);

                tableBody.appendChild(fileRow);
            });
        }
    });
}

function uploadFiles(bucketname) {
    let files = document.getElementById('fileInput').files
    var fileCount = files.length

    for (var i = 0; i < fileCount; i++) {
        var file = files[i];
        var params = {
            Bucket: bucketname,
            Key: file.name,
            Body: file
        }

        s3.upload(params, (err, data) => {
            console.log("File uploaded")
            refreshFileList(bucketname)
        })
    }
}

function deleteFile(bucketname, objectKey) { // Corrected the parameter name to objectKey
    var params = {
        Bucket: bucketname,
        Key: objectKey // Use objectKey instead of object,Key
    };

    s3.deleteObject(params, (err, data) => {
        if (err) {
            console.log("Error deleting file", err);
        } else {
            console.log("File deleted successfully");
            refreshFileList(bucketname);
        }
    });
}

function generateObjectKey(originalFileName) {
    // Generate a unique object key based on the original file name, current timestamp, and random number
    var timestamp = new Date().getTime();
    var random = Math.floor(Math.random() * 1000);
    var sanitizedFileName = originalFileName.replace(/\s+/g, "_"); // Replace spaces with underscores
    return `${timestamp}_${random}_${sanitizedFileName}`;
}

function uploadFilesMultipart(bucketname) {
    let files = document.getElementById('fileInput').files;
    var fileCount = files.length;

    for (var i = 0; i < fileCount; i++) {
        var file = files[i];

        // Create a unique object key for the uploaded file
        var objectKey = generateObjectKey(file.name);

        // Create a new multipart upload
        s3.createMultipartUpload({ Bucket: bucketname, Key: objectKey }, (err, uploadData) => {
            if (err) {
                console.log("Error creating multipart upload", err);
            } else {
                console.log("Multipart upload initiated");

                // Upload parts of the file in parallel
                uploadFileParts(file, bucketname, objectKey, uploadData.UploadId);
            }
        });
    }
}

function uploadFileParts(file, bucketname, objectKey, uploadId) {
    var partNumber = 1;
    var partSize = 5 * 1024 * 1024; // 5MB part size (adjust as needed)

    var params = {
        Bucket: bucketname,
        Key: objectKey,
        PartNumber: partNumber,
        UploadId: uploadId,
    };

    var offset = 0;
    var fileReader = new FileReader();

    fileReader.onload = function (e) {
        params.Body = e.target.result;

        // Upload the part to S3
        s3.uploadPart(params, (err, data) => {
            if (err) {
                console.log("Error uploading part", err);
            } else {
                console.log("Uploaded part #" + partNumber);
                partNumber++;

                // Continue uploading parts if there are more
                if (offset < file.size) {
                    offset += partSize;
                    readNextPart(offset);
                } else {
                    // All parts uploaded, complete the multipart upload
                    completeMultipartUpload(bucketname, objectKey, uploadId);
                }
            }
        });
    };

    function readNextPart(offset) {
        var chunk = file.slice(offset, offset + partSize);
        fileReader.readAsArrayBuffer(chunk);
    }

    // Start uploading the first part
    readNextPart(0);
}

function completeMultipartUpload(bucketname, objectKey, uploadId) {
    s3.listParts({ Bucket: bucketname, Key: objectKey, UploadId: uploadId }, (err, data) => {
        if (err) {
            console.log("Error listing parts", err);
        } else {
            // Extract the part information from the response and create an array of part numbers
            var partNumbers = data.Parts.map(part => ({ PartNumber: part.PartNumber, ETag: part.ETag }));

            // Complete the multipart upload
            s3.completeMultipartUpload({
                Bucket: bucketname,
                Key: objectKey,
                UploadId: uploadId,
                MultipartUpload: { Parts: partNumbers },
            }, (err, data) => {
                if (err) {
                    console.log("Error completing multipart upload", err);
                } else {
                    console.log("Multipart upload completed");
                    refreshFileList(bucketname);
                }
            });
        }
    });
}

refreshFileList("cloudcrowd");

