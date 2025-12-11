/* eslint-disable @typescript-eslint/no-var-requires */
//@ts-check
'use strict';

const path = require('path');
const webpack = require('webpack');

/**@type {import('webpack').Configuration}*/
const config = {
  target: 'node', // VS Code extensions run in a Node.js context
  mode: 'none', // Leave source code as close as possible (debuggable)

  entry: './src/extension.ts', // Extension entry point
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]'
  },
  devtool: 'nosources-source-map',
  externals: {
    vscode: 'commonjs vscode', // VS Code API is external
    'sql.js': 'commonjs sql.js', // SQLite WASM binary - must be external
    'better-sqlite3': 'commonjs better-sqlite3', // Optional native SQLite (not in bundle)
    '@xenova/transformers': 'commonjs @xenova/transformers' // Optional embeddings (not in bundle)
  },
  resolve: {
    extensions: ['.ts', '.js'],
    fallback: {
      // Polyfills for Node.js built-ins (webpack 5)
      "path": require.resolve("path-browserify"),
      "fs": false,
      "crypto": false
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  plugins: [
    new webpack.IgnorePlugin({
      resourceRegExp: /^encoding$/,
      contextRegExp: /node-fetch/
    })
  ]
};

module.exports = config;
