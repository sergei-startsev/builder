var path = require('path');
var mkdirp = require('mkdirp');
var fs = require('fs');
var Promise = require('bluebird');
var asp = require('bluebird').promisify;
var extend = require('./utils').extend;
var fromFileURL = require('./utils').fromFileURL;

function countLines(str) {
  return str.split(/\r\n|\r|\n/).length;
}

function createOutput(outFile, outputs, basePath, sourceMaps, sourceMapContents) {
  var concatenate = require('./sourcemaps').concatenate;
  var files = outputs.map(function (el) {
    if (el.source) {
      //normalize source urls
      el.sourceMap.sources = el.sourceMap.sources.map(function (sourceURL) {
        return sourceURL.replace(/\\/g, "/");
      });
      return {
        code: el.source,
        map: el.sourceMap
      };
    } else {
      return {
        code: el,
        map: undefined
      };
    }
  });
  //concatenates sources and appropriate source maps
  var concatenated = concatenate(files, outFile).toStringWithSourceMap({
    file: path.basename(outFile)
  });

  return {
    source: concatenated.code,
    sourceMap: concatenated.map.toString()
  };
}

function minify(output, fileName, mangle, uglifyOpts) {
  var uglify = require('uglify-js');
  var ast;
  try{
    ast = uglify.parse(output.source, { filename: fileName });
  } catch(e){
    throw new Error(e);
  }
  ast.figure_out_scope();
  
  ast = ast.transform(uglify.Compressor(uglifyOpts.compress));
  ast.figure_out_scope();
  if (mangle !== false)
    ast.mangle_names();

  var sourceMap;
  if (output.sourceMap) {
    if (typeof output.sourceMap === 'string')
      output.sourceMap = JSON.parse(output.sourceMap);

    var sourceMapIn = output.sourceMap;
    sourceMap = uglify.SourceMap({
      file: fileName,
      orig: sourceMapIn
    });

    if (uglifyOpts.sourceMapIncludeSources && sourceMapIn && Array.isArray(sourceMapIn.sourcesContent)) {
      sourceMapIn.sourcesContent.forEach(function(content, idx) {
        sourceMap.get().setSourceContent(sourceMapIn.sources[idx], content);
      });
    }
  }

  var outputOptions = uglifyOpts.beautify;
  // keep first comment
  outputOptions.comments = outputOptions.comments || function(node, comment) {
    return comment.line === 1 && comment.col === 0;
  };
  outputOptions.source_map = sourceMap;

  output.source = ast.print_to_string(outputOptions);
  output.sourceMap = sourceMap;

  return output;
}

function writeOutputFile(outFile, source, sourceMap) {
  var outDir = path.dirname(outFile);

  return asp(mkdirp)(path.dirname(outFile))
  .then(function() {
    if (!sourceMap)
      return;

    var sourceMapFileName = path.basename(outFile) + '.map';
    source += '\n//# sourceMappingURL=' + sourceMapFileName;
    
    return asp(fs.writeFile)(path.resolve(outDir, sourceMapFileName), sourceMap);
  })
  .then(function() {
    return asp(fs.writeFile)(outFile, source);
  });
}

exports.inlineSourceMap = inlineSourceMap;
function inlineSourceMap(source, sourceMap) {
  if (!sourceMap)
    throw new Error('NOTHING TO INLINE');
  return source + '\n//# sourceMappingURL=data:application/json;base64,'
      + new Buffer(sourceMap.toString()).toString('base64');
}

exports.writeOutputs = function(outputs, baseURL, outputOpts) {
  var outFile = outputOpts.outFile && path.resolve(outputOpts.outFile);
  var basePath = fromFileURL(baseURL);
  var fileName = outFile && path.basename(outFile) || 'output.js';

  var output = createOutput(outFile || path.resolve(basePath, fileName), outputs, basePath, outputOpts.sourceMaps, outputOpts.sourceMapContents);

  if (outputOpts.minify)
    output = minify(output, fileName, outputOpts.mangle, outputOpts.uglify);

  if (outputOpts.sourceMaps == 'inline') {
    output.source = inlineSourceMap(output.source, output.sourceMap);
    output.sourceMap = undefined;
  }

  if (!outputOpts.outFile)
    return Promise.resolve(output);

  return writeOutputFile(outFile, output.source, output.sourceMap).then(function() {
    return output;
  });
};
