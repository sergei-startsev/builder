var sourceMap = require('source-map');
var SourceNode = sourceMap.SourceNode;
var SourceMapConsumer = sourceMap.SourceMapConsumer;
var path = require('path');

exports.concatenate = function(files, outFile) {
  var concatenated = new SourceNode();

  files.forEach(function (file, index) {
    if (index !== 0) {
      concatenated.add("\n");
    }

    var node;
    var map = file.map;
    if (map) {
      if (typeof map.toJSON === "function") {
        map = map.toJSON();
      }
      node = SourceNode.fromStringWithSourceMap(
        file.code,
        new SourceMapConsumer(map),
        path.relative(
          path.dirname(outFile + ".map"),
          path.dirname(".")
        )
      );
    } else {
      node = new SourceNode(null, null, null, file.code);
    }

    concatenated.add(node);
  });

  return concatenated;
};
