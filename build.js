/*global require, process, console */

"use strict";

var fs = require( 'fs' );
var path = require( 'path' );

Array.prototype.include = function ( item ) {
    var i, l;
    for ( i = 0, l = this.length; i < l; i += 1 ) {
        if ( this[i] === item ) {
            return this;
        }
    }
    this[l] = item;
    return this;
};

var stripStrict = function ( string ) {
    return string.replace( /^\s*"use strict"[;,]\n?/m, '' );
};

var getRecursiveFiles = function ( dirPath ) {
    var files = fs.readdirSync(dirPath);

    var arrayOfFiles = [];

    files.forEach(function(file) {
        if (fs.statSync( dirPath + "/" + file ).isDirectory()) {
            arrayOfFiles.push.apply( arrayOfFiles, getRecursiveFiles( dirPath + "/" + file ) );
        } else {
            arrayOfFiles.push( path.join( __dirname, dirPath, "/", file ) );
        }
    });

    return arrayOfFiles;
};

var groupIntoModules = function ( files ) {
    var modules = {};
    files.forEach( function ( file ) {
        var moduleName = file.module;
        if ( !moduleName ) {
            throw new Error( 'File ' + file.src + ' belongs to no module!' );
        }
        var module = modules[ moduleName ] = ( modules[ moduleName ] || {
            name: moduleName,
            dependencies: [],
            files: []
        });
        module.files.push( file );
        file.dependencies = file.dependencies.filter( function ( dependency ) {
            if ( dependency.slice( -3 ) !== '.js' ) {
                module.dependencies.include( dependency );
                return false;
            }
            return true;
        });
    });
    var result = [];
    for ( var m in modules ) {
        result.push( modules[m] );
    }
    return result;
};

var sort = function ( array ) {
    var tree = {};
    array.forEach( function ( obj ) {
        tree[ obj.name ] = {
            obj: obj
        };
    });
    array.forEach( function ( obj ) {
        tree[ obj.name ].dependencies =
                obj.dependencies.map( function ( name ) {
            var dependency = tree[ name ];
            if ( !dependency ) {
                console.log( obj.name + ' requires ' + name +
                    ' but we do not have it!' );
            }
            return dependency;
        });
    });
    var result = [];
    var output = function output( node ) {
        if ( node.isOutput ) { return; }
        node.dependencies.forEach( function ( dependency ) {
            output( dependency );
        });
        node.isOutput = true;
        result.push( node.obj );
    };
    for ( var key in tree ) {
        if ( tree.hasOwnProperty( key ) ) {
            output( tree[ key ] );
        }
    }
    return result;
};

var sortByDependencies = function ( files ) {
    var parsers = {
        name: /^\/\/\sFile:([^\\]+)\\\\$/m,
        module: /^\/\/\sModule:([^\\]+)\\\\$/m,
        dependencies: /^\/\/\sRequires:([^\\]+)\\\\$/m
    };
    var parsed = files.map( function ( file ) {
        var info = {
            data: file
        };
        for ( var attr in parsers ) {
            var value = parsers[ attr ].exec( file ) || '';
            // Get first capture group and clean it.
            if ( value ) { value = value[1].replace( /\s/g, '' ); }
            if ( attr === 'dependencies' ) {
                value = value ? value.split( ',' ) : [];
            }
            info[ attr ] = value;
        }
        return info;
    });
    var modules = sort( groupIntoModules( parsed ) );

    return modules.reduce( function ( array, module ) {
        sort( module.files ).forEach( function ( file ) {
            array.push( file.data );
        });
        return array;
    }, [] );
};

var makeModule = function ( inputDir, output ) {
    var inputs = getRecursiveFiles( inputDir ).filter(function ( file ) {
        return /\.js$/.test( file );
    });

    // Always keep in the same order.
    inputs.sort();
    var module = '"use strict";\n\n';
    var jsData = inputs.map( function ( input ) {
        return stripStrict( fs.readFileSync( input, 'utf8' ) );
    });

    module += sortByDependencies( jsData ).join( '\n\n' );

    if (!fs.existsSync(path.dirname( output ))) {
        fs.mkdirSync(path.dirname( output ));
    }

    fs.writeFileSync( output, module );
};

var args = process.argv.slice( 2 ),
    sourceDir = args[ 0 ],
    outputFile = args[ 1 ];

makeModule( sourceDir, outputFile );
