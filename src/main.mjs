// Runtime
import fs from "fs";

// Libs
import chokidar from 'chokidar';
import CSSOM from 'cssom';
import { glob } from 'glob';
import { JSDOM } from 'jsdom';

// Shorthands
var log = console.log;

// Globals
const TAB = "\x20".repeat(4);
var ELEMENT_NODE;
var TEXT_NODE;
var COMMENT_NODE;

var ____UTILS____;

// Tag name to class name
function tag2class(tagName){
    if (tagName=="SPAN") return "Container";
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

    var nodeId="",nodeClass="";

    if (node.getAttribute!=null && node.getAttribute("id")!=null)
        nodeId = `#${node.getAttribute("id")}`;
    if (node.getAttribute!=null && node.getAttribute("class")!=null){
        let c = node.getAttribute("class").trim().replace(/[\s]{2,}/g,"\x20")
            .replaceAll("\x20",".");
        nodeClass = `.${c}`;
    }
    var tail = `// ${nodeId} ${nodeClass}`.replace(/[\s]{2,}/g,"\x20");

    if (tail.trim()!="//")
        dart.code += `${indent}${tail}\n`;

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
    function processColor(color){
        color = color.trim();
        if (!color.startsWith("#")) return color;

        if (color.match(/^#[0-9A-Fa-f]{3}$/) != null){
            let char1=color.slice(1,2); 
            let char2=color.slice(2,3); 
            let char3=color.slice(3,4); 
            return "#" + char1.repeat(2) + char2.repeat(2) + char3.repeat(2);
        }
        // Unknown cases
        return color;
    }
    function makeBoxDecoration(node){
        var color, rValues;

        try{
            color = processColor(node.getAttribute("h2d-background-color"));
            color = color.startsWith("#")? 
                `Color(0x${color.slice(1).toUpperCase()})`
                :`Colors.${color.toLowerCase()}`;
        } catch{
            color = "Colors.white";
        }
        try{
            rValues = node.getAttribute("h2d-border-radius").trim().replace(/[\s]{2,}/g,"\x20");
        } catch{
            rValues = "0";
        }

        if (!rValues.includes("\x20"))
            var [b1,b2,b3,b4] = [rValues,rValues,rValues,rValues];
        else 
            var [b1,b2,b3,b4] = rValues.split("\x20");

        return `BoxDecoration(color: ${color}, borderRadius: `+
        `BorderRadius.only(topLeft: Radius.circular(${b1}), topRight: Radius.circular(${b2}), `+
        `bottomRight: Radius.circular(${b3}), bottomLeft: Radius.circular(${b4})))`;
    }
    function makeElevatedButtonStyle(node){
        var padding, minWidth, minHeight;

        try{
            padding = node.getAttribute("h2d-padding");            
        } catch{
            padding = 0;
        }
        try{
            minWidth = node.getAttribute("h2d-min-width").trim();
            if (minWidth.startsWith("$(")) minWidth=minWidth.slice(2).replace(/\)$/,"");            
        } catch{
            minWidth = 50;
        }
        try{
            minHeight = node.getAttribute("h2d-min-height").trim();
            if (minHeight.startsWith("$(")) minHeight=minHeight.slice(2).replace(/\)$/,"");
        } catch{
            minHeight = 50;
        }

        return `ElevatedButton.styleFrom(`+
            `shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(25)),`+
            `padding: EdgeInsets.fromLTRB(${padding}, ${padding}, ${padding}, ${padding}),`+
            `minimumSize: Size(${minWidth}, ${minHeight}),`+
            `fixedSize: Size(${minWidth}, ${minHeight}),`+
            `backgroundColor: Colors.white,`+
            `elevation: 2,`+
        `)`;
    }
    function cssKvToFlutterProp(node,attrName,propName,value){
        const PROP_MAP = {
            h2dWidth:"width", h2dHeight:"height", h2dColor:"color"
        };
        const ATTR_SETS = [
            ["h2d-background-color","h2d-border-radius"],
            ["h2d-padding","h2d-min-width","h2d-min-height"]
        ];
        function getAttrSet(attrName){
            for (let s of ATTR_SETS)
                if (s.includes(attrName)) return s;

            return null;
        }

        // Single value
        if (PROP_MAP[propName]!=null){        
            propName = PROP_MAP[propName];
            value = value.replaceAll('"','\\"');

            if (value.trim().startsWith("$(")){
                value = value.trim().slice(2).replace(/\)$/,"");
            }
            value = processColor(value);
            return [propName,value,[]];
        }

        // Set of attributes
        var set = getAttrSet(attrName);

        if (set != null){
            if (set.includes("h2d-background-color") || set.includes("h2d-border-radius"))
                return ["decoration",makeBoxDecoration(node),set];
            else 
            if (node.tagName=="elevated-button" && 
                    (set.includes("h2d-padding") || set.includes("h2d-min-width") 
                    || set.includes("h2d-min-height"))){
                return ["style",makeElevatedButtonStyle(node),set];
            }
        }
        
        // Unknown cases
        return [propName,value,[]];
    }
    function processAttributes(node){
        if (node.getAttributeNames==null) return;
        const NO_QUOTES = [
            "onPressed","onLongPress","width","height","decoration","style","p",
            "controller", "onTap", "thumbVisibility", "interactive"
        ]; // More
        const SKIPS = ["if","for","id","class","paField"];
        
        var attrNames = node.getAttributeNames();
        var propNames = attrNames.map(x => attr2prop(x));
        var indent2 = indent+"\x20".repeat(4);
        var processedAttrs = [];

        for (let i=0; i<propNames.length; i++){
            let attrName = attrNames[i];
            if (processedAttrs.includes(attrName)) continue;

            let _propName = propNames[i];
            let [propName,value,processeds] = 
                cssKvToFlutterProp(node,attrName,_propName,node.getAttribute(attrName));
            if (SKIPS.includes(propName)) continue;
            processedAttrs = processedAttrs.concat(processeds);

            if (NO_QUOTES.includes(propName))
                dart.code += `${indent2}${propName}: ${value},\n`;
            else {
                if (value.startsWith("*"))
                    dart.code += `${indent2}${propName}: ${value.slice(1).trim()},\n`;
                else 
                    dart.code += `${indent2}${propName}: "${value}",\n`;
            }
        }
    }
    const knownClasses = {
        body:"Container", box:"Container", div:"Row", span:"Container"
    };
    // These must have "child:"
    const withChild = {
        "sized-box":true, "elevated-button":true, span:true, center:true,
        "scrollbar":true, "single-child-scroll-view":true, container:true, box:true
    };
    // These must have "children:"
    const withChildren = {
        row:true, div:true, wrap:true
    };

    // jsdom parse XML to lowercase tags, HTML to uppercase
    // Root tag
    if (node.tagName=="flutter-html"){
        log("Root tag found");
        goDeeper();
    }
    else
    // Import tags
    if (node.tagName=="import"){
        let packagePath = node.getAttribute("package");
        dart.code += `import "${packagePath}";\n`;
        // No other attributes
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
        // No other attributes
    }
    else    
    // Screen scaffold
    if (node.tagName=="scaffold"){
        dart.code += `${indent}Scaffold(body:\n`;
        goDeeper();
        // No other attributes
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
    // Component container
    if (node.tagName=="container" && depth==1){
        dart.code += `${indent}Container(child:\n`;
        goDeeper();
        // No other attributes
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
        let postAttributeStr = "";
        let withChildAutoRow = false;

        if (withChildren[node.tagName]==true){
            dart.code += `\n${indent}${clause}?\n${indent}${className}(\n`;
            postAttributeStr = `${indent}${TAB}children: __flatten([\n`;
        }
        else 
        if (withChild[node.tagName]==true){
            if (node.tagName!="column" && node.children!=null && node.children.length>0 
                    && (node.children[0].tagName=="div" || node.children[0].tagName=="row")){
                let className = knownClasses[node.tagName] || tag2class(node.tagName);
                dart.code += `\n${indent}${clause}?\n${indent}${className}(\n`;
                postAttributeStr = `${indent}${TAB}child: Column(children: __flatten([\n`;
                withChildAutoRow = true;                
            }else {
                if (node.childNodes.length>0 && node.innerHTML.trim().length>0){
                    dart.code += `\n${indent}${clause}?\n${indent}${className}(\n`;
                    postAttributeStr = `${indent}${TAB}child:\n`;
                }
                else 
                    dart.code += `\n${indent}${clause}?\n${indent}${className}(\n`;
            }
        }
        else
            dart.code += `\n${indent}${clause}?\n${indent}${className}(\n`;
        
        processAttributes(node);
        dart.code += postAttributeStr;
        goDeeper();        

        if (withChildren[node.tagName]==true)
            dart.code += `${indent}])):SizedBox(),\n`;
        else 
        if (withChild[node.tagName]==true){
            if (withChildAutoRow==true)
                dart.code += `${indent}]))):SizedBox(),\n`;
            else
                dart.code += `${indent}):SizedBox(),\n`;
        }
        else 
            dart.code += `${indent}):SizedBox(),\n`;
    }
    else 
    // Any tag with 'for'
    if (node.getAttribute!=null && node.getAttribute("for")!=null){
        var arr = node.getAttribute("for");
        dart.code += `${indent}${arr}.map((x)=>\n`;

        var clonedNode = node.cloneNode(true);
        clonedNode.removeAttribute("for");
        travelToEle(clonedNode,cssRules,dart,depth+1);            

        dart.code += `${indent}).toList(),\n`;
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
                processAttributes(node);
                dart.code += `${indent}${tab}${paField}:\n`;                
                travelToEle(c,cssRules,dart,depth+1);            
                c.setAttribute("pa-field-processed","yes");
            }
        
        goDeeper();
        // Upper tier of DFS, processAttributes inside travelToEle again.
        dart.code += `${indent}),\n`;
    }
    else    
    // Auto-column above div, row
    // CONDITION: A DIV OR ROW TAG NOT IN COLUMN TAG
    if (node.tagName!="column" && node.tagName!="wrap" && node.children!=null && node.children.length>0 
            && (node.children[0].tagName=="div" || node.children[0].tagName=="row")){
        let className = knownClasses[node.tagName] || tag2class(node.tagName);
        dart.code += `${indent}${className}(\n`;
        let postAttributeStr;

        if (className!="Row")
            postAttributeStr = `${indent}${TAB}child: Column(children: __flatten([\n`;
        else 
            postAttributeStr = `${indent}${TAB}children: [Column(children: __flatten([\n`;

        processAttributes(node);
        dart.code += postAttributeStr;
        goDeeper();

        if (className!="Row")
            dart.code += `${indent}]))),\n`;
        else 
            dart.code += `${indent}]))]),\n`;
    }
    else 
    // Auto-row if span has more than 1 child
    // CONDITION: A SPAN OR CONTAINER TAG WITH MORE THAN 1 CHILD
    if ((node.tagName=="span" || node.tagName=="container") && node.children!=null 
            && node.children.length>1){
        let className = knownClasses[node.tagName] || tag2class(node.tagName);
        dart.code += `${indent}${className}(\n`;
        let postAttributeStr;
        postAttributeStr = `${indent}${TAB}child: Row(children: __flatten([\n`;

        processAttributes(node);
        dart.code += postAttributeStr;
        goDeeper();
        dart.code += `${indent}]))),\n`;
    }
    else 
    // Those with child (no children prop)
    if (withChild[node.tagName]!=null){
        let className = knownClasses[node.tagName] || tag2class(node.tagName);

        if (node.childNodes.length>0 && node.innerHTML.trim().length>0){
            dart.code += `${indent}${className}(\n`;
            let postAttributeStr = `${indent}${TAB}child:\n`;
            processAttributes(node);
            dart.code += postAttributeStr;
            goDeeper();
            dart.code += `${indent}),\n`;
        }
        else{            
            dart.code += `${indent}${className}(\n`;
            processAttributes(node);
            dart.code += `${indent}),\n`;
        }
    }
    else     
    // Those with children
    if (withChildren[node.tagName]!=null){
        let className = knownClasses[node.tagName] || tag2class(node.tagName);
        dart.code += `${indent}${className}(\n`;
        let postAttributeStr = `${indent}${TAB}children: __flatten([\n`;
        processAttributes(node);
        dart.code += postAttributeStr;
        goDeeper();
        dart.code += `${indent}])),\n`;
    }
    else 
    // HTML -> Flutter tags    
    if (knownClasses[node.tagName] != null){
        let className = knownClasses[node.tagName] || tag2class(node.tagName);        
        dart.code += `${indent}${className}(\n`;
        let postAttributeStr = "";

        if (withChildren[node.tagName])
            postAttributeStr = `${indent}${TAB}children: __flatten([\n`;
        else if (withChild[node.tagName])
            postAttributeStr = `${indent}${TAB}child:\n`;

        processAttributes(node);        
        dart.code += postAttributeStr;
        goDeeper();

        if (withChildren[node.tagName])
            dart.code += `${indent}])),\n`;
        else if (withChild[node.tagName])
            dart.code += `${indent}),\n`;
        else 
            dart.code += `${indent}),\n`;
    } 
    else 
    // Other elements    
    if (node.nodeType==ELEMENT_NODE){
        let className = knownClasses[node.tagName] || tag2class(node.tagName);
        dart.code += `${indent}${className}(\n`;
        processAttributes(node);
        goDeeper();
        dart.code += `${indent}),\n`;
    } 
    else 
    // Text node    
    if (node.nodeType==TEXT_NODE){
        if (node.textContent.trim().length>0){            
            var text = node.textContent.replace(/[\s]{2,}/g,"\x20")
                .replaceAll("\r","\x20").replaceAll("\n","\x20").trim();
            var styling = "";    

            if (node.parentElement!=null && node.parentElement.tagName=="elevated-button")
                styling = ",maxLines:1,overflow:TextOverflow.ellipsis";

            if (text.startsWith("$(")){
                text = text.slice(2).trim().replace(/\)$/,"");
                dart.code += `${indent}Text(${text}${styling}),\n`;
            }
            else {
                text = text.replaceAll('"','\\"');
                dart.code += `${indent}const Text("${text}"${styling}),\n`;
            }
        }
        // No other attributes
    } 
    else 
    // Comment node    
    if (node.nodeType==COMMENT_NODE){
        dart.code += `${indent}/*${node.textContent}*/\n`;
        // No other attributes
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
    log("Parsing HTML...");
    var dom = new JSDOM(htmlContent,{
        // WARN: Need this or the tag after a self-closing tag becomes child.
        contentType: 'application/xml'
    });
    log("HTML parsed");
    var document = dom.window.document;
    var rootEle = document.documentElement; // flutter-html tag
    // var body = document.querySelector("body"); // No 'body' in xml
    // log(rootEle.outerHTML);
    // Sample DOM got:
    /* <html><head></head><body>
           <import package="flutter/material.dart">
           <import package="flutter/cupertino.dart">
           <main-ui-view with=...*/

    // CSS
    log("Parsing CSS...");
    const sheet = CSSOM.parse(cssContent);
    log("CSS parsed");
    // console.log(sheet.cssRules);
    
    for (let rule of sheet.cssRules){
        let selector = rule.selectorText;
        let eles = [...document.querySelectorAll(selector)];

        for (let ele of eles){            
            for (let i=0; i<rule.style.length; i++){
                let key = rule.style[i];
                let value = rule.style[key];
                ele.setAttribute("h2d-"+key, value);
            }
        }
    }

    // Convert to dart
    ELEMENT_NODE = dom.window.Node.ELEMENT_NODE;
    TEXT_NODE = dom.window.Node.TEXT_NODE;
    COMMENT_NODE = dom.window.Node.COMMENT_NODE;

    var dart = {code:
        "// Generated by html2dart\n"+
        "// NOTE: DIV FOR HTML2DART HAS NO CSS, ONLY SPAN\n"
    };
    travelToEle(rootEle,sheet,dart,-1); // -1 to ignore root tag indent
    // log("Dart code ========================================");
    // log(dart.code);
    // log("========================================");
    fs.writeFileSync(dartFilePath,dart.code);
}

// Get file modified time
async function getModifiedTime(filePath){
    const stat = await fs.promises.stat(filePath);
    return stat.mtimeMs;
}

// Check if file exists
async function fileExists(path) {
    try {
        await fs.promises.access(path);
        return true;
    } catch {
        return false;
    }
}

var ____CORE____;

// Uncaught synchronous exceptions
process.on('uncaughtException', err => {
    log('\nUncaught exception:', err);
    log(err.stack);
});

// Unhandled Promise rejections
process.on('unhandledRejection', (reason, promise) => {
    log('\nUnhandled rejection:', reason);
    log(reason.stack);
});

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
    log("****************************************");
    log("NOTE: Under screen tag must be scaffold > body");
    log("NOTE: Under component tag must be container > box");
    log("NOTE: div tag to divide vertically");
    log("NOTE: span tag to divide horizontally");
    log("NOTE: Use $(..) for variable in HTML/CSS text");
    log("****************************************");

    chokidar.watch(relativePath, {
        usePolling: true // Equivalent to nodemon -L
    }).on('change', async(f)=>{
        if (/\.(html|css)$/.test(f)) {
            console.log('\nChanged:', f);
            f = f.replace(/\.[a-z]+$/, ".html");
            let htmlFilePath = f;            
            let cssFilePath = f.replace(/\.html$/,'.css');
            let dartFilePath = f.replace(/\.html$/,'.dart');
            // log("HTML file:",htmlFilePath);
            // log("CSS  file:",cssFilePath);
            // log("Dart file:",dartFilePath);

            if (!await fileExists(cssFilePath)){
                log(`Missing CSS, skipping ${f}`);
                return;
            }
            // Convert            
            log("Processing modified file:",htmlFilePath);
            convertToDart(htmlFilePath,cssFilePath,dartFilePath);        
        }
    });
})();
// EOF

