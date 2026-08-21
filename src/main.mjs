// Runtime
import fs from "fs";

// Libs
import CSSOM from 'cssom';
import { glob } from 'glob';
import { JSDOM } from 'jsdom';

// Shorthands
var log = console.log;

// Globals
var ELEMENT_NODE;
var TEXT_NODE;
var COMMENT_NODE;

// Tag name to class name
function tag2class(tagName){
    if (tagName=="DIV") return "Container";
    var tokens = tagName.toLowerCase().trim().split("-");
    var className = [];

    for (let i=0; i<tokens.length; i++){
        className.push(tokens[i][0].toUpperCase() + tokens[i].substring(1));
    }
    return className.join("");
}

// Tag attribute name to class prop name
function attr2prop(attrName){
    var temp = tag2class(attrName);
    return temp.substring(0,1).toLowerCase() + temp.slice(1);
}

// Check if node has children with pa-field
function hasChildrenWithPaField(node){
    if (node.children==null || node.children.length==0) return false;

    for (let c of node.children)
        if (c.getAttribute!=null && c.getAttribute("pa-field")!=null)
            return true;

    return false;
}

// Travel to element in dom
function travelToEle(node,cssRules,dart,depth){
    if (depth < 0)
        var indent = "";
    else 
        var indent = "\x20\x20\x20\x20".repeat(depth);

    function goDeeper(){
        for (let childNode of node.childNodes)
            // Those with pa-field are processed separately
            if (childNode.nodeType==ELEMENT_NODE){
                if (childNode.getAttribute("pa-field-processed")==null)
                    travelToEle(childNode,cssRules,dart,depth+1);            
            }
            else
                travelToEle(childNode,cssRules,dart,depth+1);            
    }
    function processAttributes(node){
        if (node.getAttributeNames==null) return;
        const NO_QUOTES = ["onPressed","onLongPress"]; // More
        const SKIPS = ["if","for","id","class","paField"];
        var attrNames = node.getAttributeNames();
        var propNames = attrNames.map(x => attr2prop(x));
        var indent2 = indent+"\x20".repeat(4);

        for (let i=0; i<propNames.length; i++){
            let attrName = attrNames[i];
            let propName = propNames[i];
            let value = node.getAttribute(attrName).replaceAll('"','\\"');
            if (SKIPS.includes(propName)) continue;

            if (NO_QUOTES.includes(propName))
                dart.code += `${indent2}${propName}: ${value},\n`;
            else 
                dart.code += `${indent2}${propName}: "${value}",\n`;
        }
    }
    const knownClasses = {div:"Container"};
    // These must have "child:"
    const withChild = {"sized-box":true, "elevated-button":true, "div":true, "center":true};
    // These must have "children:"
    const withChildren = {row:true};

    // jsdom parse XML to lowercase tags, HTML to uppercase
    // Root tag
    if (node.tagName=="flutter-xml"){
        log("Root tag found");
        goDeeper();
    }
    else
    // Import tags
    if (node.tagName=="import"){
        let packagePath = node.getAttribute("package");
        dart.code += `import "package:${packagePath}";\n`;
    }
    else  
    // Function tag
    if (node.getAttribute!=null && node.getAttribute("with") != null){
        var paramNames = node.getAttribute("with").trim().replace(/[\s]{2,}/g,"\x20").split("\x20");
        var returnClass = tag2class(node.children[0].tagName);
        var className = tag2class(node.tagName);
        dart.code += `\n${returnClass} ${className}({`;
        var arr = [];

        for (let n of paramNames)
            arr.push(`required ${n}`);

        dart.code += arr.join(",");
        dart.code += `}) {\n\x20\x20\x20\x20return\n`;
        goDeeper();
    }
    else    
    // Screen scaffold
    if (node.tagName=="scaffold"){
        dart.code += `${indent}Scaffold(body:\n`;
        goDeeper();
        dart.code += `${indent});\n}\n\n`;

        // Mimic the mechanism of flutter-view.io
        dart.code += 
        `// Mimic flutter-view.io\n`+
        `__flatten(List list) {\n`+
        `    return List<Widget>.from(list.expand((item) {\n`+
        `        return item is Iterable ? item : [item as Widget];\n`+
        `    }));\n`+
        `}\n// EOF\n`;
    }
    else 
    // Any tag with 'if'
    if (node.getAttribute!=null && node.getAttribute("if")!=null){
        let clause = node.getAttribute("if");
        let className = knownClasses[node.tagName] || tag2class(node.tagName);

        if (withChildren[node.tagName]==true)
            dart.code += `\n${indent}${clause}?\n${indent}${className}(children: __flatten([\n`;
        else 
        if (withChild[node.tagName]==true){
            if (node.childNodes.length>0 && node.innerHTML.trim().length>0)
                dart.code += `\n${indent}${clause}?\n${indent}${className}(child:\n`;
            else 
                dart.code += `\n${indent}${clause}?\n${indent}${className}(\n`;
        }
        else
            dart.code += `\n${indent}${clause}?\n${indent}${className}(\n`;
        
        goDeeper();
        processAttributes(node);

        if (withChildren[node.tagName]==true)
            dart.code += `${indent}])):SizedBox(),\n`;
        else 
        if (withChild[node.tagName]==true)
            dart.code += `${indent}):SizedBox(),\n`;
        else 
            dart.code += `${indent}):SizedBox(),\n`;
    }
    else 
    // Any tag with 'for'
    if (node.getAttribute!=null && node.getAttribute("for")!=null){
        // todo
    }
    else 
    // Any tag having children with 'pa-field'
    if (hasChildrenWithPaField(node)){
        let tab = "\x20".repeat(4);
        let className = knownClasses[node.tagName] || tag2class(node.tagName);
        dart.code += `${indent}${className}(\n`;        

        for (let c of node.children)
            if (c.getAttribute!=null && c.getAttribute("pa-field")!=null){
                let paField = c.getAttribute("pa-field");
                dart.code += `${indent}${tab}${paField}:\n`;
                travelToEle(c,cssRules,dart,depth+1);            
                c.setAttribute("pa-field-processed","yes");
            }
        
        goDeeper();
        dart.code += `${indent}),\n`;
    }
    else    
    // Auto-column above row
    if (node.tagName!="column" && node.children!=null && node.children.length>0 
            && node.children[0].tagName=="row"){
        let className = knownClasses[node.tagName] || tag2class(node.tagName);
        dart.code += `${indent}${className}(child: Column(children: __flatten([\n`;
        goDeeper();
        processAttributes(node);
        dart.code += `${indent}]))),\n`;
    }
    else 
    // Those with child (no children prop)
    if (withChild[node.tagName]!=null){
        let className = knownClasses[node.tagName] || tag2class(node.tagName);

        if (node.childNodes.length>0 && node.innerHTML.trim().length>0){
            dart.code += `${indent}${className}(child:\n`;
            goDeeper();
            processAttributes(node);
            dart.code += `${indent}),\n`;
        }
        else{
            dart.code += `${indent}${className}(),\n`;
        }
    }
    else     
    // Those with children
    if (withChildren[node.tagName]!=null){
        let className = knownClasses[node.tagName] || tag2class(node.tagName);
        dart.code += `${indent}${className}(children: __flatten([\n`;
        goDeeper();
        processAttributes(node);
        dart.code += `${indent}])),\n`;
    }
    else 
    // HTML -> Flutter tags    
    if (knownClasses[node.tagName] != null){
        let className = knownClasses[node.tagName] || tag2class(node.tagName);
        dart.code += `${indent}${className}(\n`;
        goDeeper();
        processAttributes(node);
        dart.code += `${indent}),\n`;
    } 
    else 
    // Other elements    
    if (node.nodeType==ELEMENT_NODE){
        let className = knownClasses[node.tagName] || tag2class(node.tagName);
        dart.code += `${indent}${className}(\n`;
        goDeeper();
        processAttributes(node);
        dart.code += `${indent}),\n`;
    } 
    else 
    // Text node    
    if (node.nodeType==TEXT_NODE){
        if (node.textContent.trim().length>0)
            dart.code += `${indent}const `+
            `Text("${node.textContent.replaceAll('"','\\"')}"),\n`;
    } 
    else 
    // Comment node    
    if (node.nodeType==COMMENT_NODE){
        dart.code += `${indent}/* ${node.textContent} */\n`;
    } 
    // Not to handle
    else {
        log("Weird node type:",node.nodeType);
    }    
}

// Convert html+css files to dart
function convertToDart(htmlFilePath,cssFilePath,dartFilePath){
    var htmlContent = fs.readFileSync(htmlFilePath,'utf-8');
    var cssContent = fs.readFileSync(cssFilePath,'utf-8');
    log("HTML length:",htmlContent.length);
    log("CSS length:",cssContent.length);   

    // HTML
    var dom = new JSDOM(htmlContent,{
        // WARN: Need this or the tag after a self-closing tag becomes child.
        contentType: 'application/xml'
    });
    var document = dom.window.document;
    var rootEle = document.documentElement;
    // var body = document.querySelector("body"); // No 'body' in xml
    // log(rootEle.outerHTML);
    // Sample DOM got:
    /* <html><head></head><body>
           <import package="flutter/material.dart">
           <import package="flutter/cupertino.dart">
           <main-ui-view with=...*/

    // CSS
    const sheet = CSSOM.parse(cssContent);
    // console.log(sheet.cssRules);

    // Convert to dart
    ELEMENT_NODE = dom.window.Node.ELEMENT_NODE;
    TEXT_NODE = dom.window.Node.TEXT_NODE;
    COMMENT_NODE = dom.window.Node.COMMENT_NODE;

    var dart = {code:"// Generated by html2dart\n"};
    travelToEle(rootEle,sheet,dart,-1); // -1 to ignore root tag indent
    // log("Dart code ========================================");
    // log(dart.code);
    // log("========================================");
    fs.writeFileSync(dartFilePath,dart.code);
}

// Main
(async function main(){
    log("\nStarting html2dart");
    log("Current dir:",process.cwd());
    log("CLI args:",process.argv);   
    var relativePath = process.argv.slice(-1)[0];
    relativePath = "./"+relativePath;
    
    if (process.argv.length!=3){
        log("Currently run as: node main.mjs lib");
        log("Usage: html2dart <relative-path-without-dot>");
        process.exit();
    }
    const files = await glob(relativePath+'/**/*.html');
    log("HTML files found:");
    log(files);

    for (let f of files){
        let htmlFilePath = f;
        let cssFilePath = f.replace(/\.html$/,'.css');
        let dartFilePath = f.replace(/\.html$/,'.dart');
        log("\nProcessing:",htmlFilePath);
        convertToDart(htmlFilePath,cssFilePath,dartFilePath);        
    }
})();
// EOF

