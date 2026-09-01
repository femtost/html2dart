// HTML tag ref: https://www.w3schools.com/tags/
// HTML attr ref: https://www.w3schools.com/tags/ref_attributes.asp
// CSS ref: https://www.w3schools.com/cssref/index.php

// New syntax in html
// Tags: import, tagdef
// New attributes: func, params, err-src
// Evaluate value: $(...), 
// it is parentheses coz '{}' errs in CSS, '[]' is array, '<>' is awkward,
// and $(..) is read as 'take value of', value function.

// Runtime
import fs from "fs";

// Libs
import chokidar from 'chokidar';
import CSSOM from 'cssom';
import { glob } from 'glob';
import { JSDOM } from 'jsdom';

// Shorthands
var log = console.log;
var keys = Object.keys;

// Globals
const NO_QUOTES = "no-quotes";
const WITH_QUOTES = "with-quotes";
const CHILD_ATTR = "child-attr";
const TAB = "\x20".repeat(4);
var ELEMENT_NODE;
var TEXT_NODE;
var COMMENT_NODE;

var ____UTILS____;
var ____Miscs____;

// Get file modified time
async function getModifiedTime(filePath) {
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

var ____Dom____;

// Tag name to class name
function tag2class(tagName) {
    if (tagName == "SPAN") return "Container";
    var tokens = tagName.toLowerCase().trim().split("-");
    var className = [];

    for (let i = 0; i < tokens.length; i++) {
        className.push(tokens[i][0].toUpperCase() + tokens[i].substring(1));
    }
    return className.join("");
}

// Tag attribute name to class prop name
function attr2prop(attrName) {
    var temp = tag2class(attrName);
    return temp.substring(0, 1).toLowerCase() + temp.slice(1);
}

// Get node id and classes
function getNodeIdAndClasses(node) {
    var nodeId, nodeClass;

    if (node.getAttribute("id") != null)
        nodeId = node.getAttribute("id").trim();
    else
        nodeId = "--";

    if (node.getAttribute("class") != null)
        nodeClass = node.getAttribute("class").trim()
            .replace(/[\s]{2,}/g, "\x20").replaceAll("\x20", ".");
    else
        nodeClass = "--";

    return [nodeId, nodeClass];
}

var ____CONVERSION____;
var ____Tags____;
var tagProcessors = {};

// Add marker to output dart code
function addMarker(dart, node) {
    var indent = node.indent;
    var [nodeId, nodeClass] = getNodeIdAndClasses(node);
    var str = `${indent}// ${node.tagName} #${nodeId} .${nodeClass}\n`;
    dart.code += str;
}

// Process text
function parseText(text) {
    text = text.trim();

    if (text.startsWith("$("))
        return [NO_QUOTES, text.slice(2).replace(/\)$/, "").trim()];
    else
        return [WITH_QUOTES, text];
}

// Make colour
function processColor(color) {
    color = color.trim();
    if (!color.startsWith("#")) return color;

    if (color.match(/^#[0-9A-Fa-f]{3}$/) != null) {
        let char1 = color.slice(1, 2);
        let char2 = color.slice(2, 3);
        let char3 = color.slice(3, 4);
        return "#" + char1.repeat(2) + char2.repeat(2) + char3.repeat(2);
    }
    // Unknown cases
    return color;
}

// Convert CSS colour to Flutter value
function colorToFlutter(cssColor) {
    var color;

    try {
        color = processColor(cssColor);
        color = color.startsWith("#") ?
            `Color(0x${color.slice(1).toUpperCase()})`
            : `Colors.${color.toLowerCase()}`;
    } catch {
        color = "Colors.white";
    }
    return color;
}

// Check to add a comma at tail of node
function comma(node) {
    var havingIfOnly = node.getAttribute("if") != null && node.getAttribute("foreach") == null;
    var havingForOnly = node.getAttribute("if") == null && node.getAttribute("foreach") != null;
    var havingIfAndFor = node.getAttribute("if") != null && node.getAttribute("foreach") != null;
    var havingLogicTail = havingIfOnly == true || havingForOnly == true || havingIfAndFor == true;

    if (havingIfOnly) return "";
    if (havingForOnly) return ",";
    if (havingIfAndFor) return ",";
    return ",";
}

// Transform 'click' attribute, use onPressed or gesture tag wrapper
function transformClick(node, attr, value) {
    if (node.tagName == "BUTTON") {
        return [true, "onPressed", value];
    }

    return [false, attr, value];
}

// Transform attribute
function transformAttribute(node, attr, value) {
    const ATTR2PROP = {
        "h2d-width": "width", "h2d-height": "height"
    };
    const NOQUOTE_ATTRS = ["h2d-width", "h2d-height"];
    const NOQUOTE_PROPS = ["onPressed"];
    var attr2transform = {
        "onclick": transformClick
    };
    var [todo, value] = parseText(node.getAttribute(attr));
    if (NOQUOTE_ATTRS.includes(attr)) todo = NO_QUOTES;

    if (ATTR2PROP[attr] != null) {
        return [false, todo, ATTR2PROP[attr], value];
    } else if (attr2transform[attr] != null) {
        let [forChild, propName, value2] = attr2transform[attr](node, attr, value);
        if (NOQUOTE_PROPS.includes(propName)) todo = NO_QUOTES;
        return [forChild, todo, propName, value2];
    } else {
        return [false, todo, attr, value];
    }
}

// Tag attributes
function processAttributes(dom, node, cssRules, dart, depth) {
    const IGNORES = ["id", "class", "if", "foreach"];
    const EXP_ATTRS = ["onclick", "oncontextmenu"];
    var attrs = [...node.getAttributeNames()];
    var indent = node.indent;
    var childAttrs = {};

    for (let at of attrs) {
        at = at.toLowerCase();
        if (IGNORES.includes(at)) continue;
        let attrValue = node.getAttribute(at);
        let [forChild, todo, propName, value] = transformAttribute(node, at, attrValue);

        if (forChild) {
            if (todo == NO_QUOTES)
                childAttrs[propName] = value;
            else
                childAttrs[propName] = '"' + value + '"';
        }
        else if (todo == NO_QUOTES)
            dart.code += `${indent}${TAB}${propName}: ${value},\n`;
        else {
            value = value.replaceAll('"', '\\"');
            dart.code += `${indent}${TAB}${propName}: "${value}",\n`;
        }
    }
    return childAttrs;
}

// Make child attribute lines
function makeChildAttrLines(indent, childAttrs) {
    var childAttrLines = "";

    if (childAttrs != null && keys(childAttrs).length > 0) {
        for (let k in childAttrs) {
            let v = childAttrs[k];
            if (childAttrLines.length == 0) childAttrLines = "\n";
            childAttrLines += `${indent}${TAB}${TAB}${k}: ${v},\n`;
        }
        childAttrLines += `${indent}${TAB}${TAB}`;
    }
    return childAttrLines;
}

// Process HTML tag
tagProcessors.HTML = function (dom, node, cssRules, dart, depth) {
}
tagProcessors.HTMLtail = function (dom, node, cssRules, dart, depth) {
}

// Process HEAD tag
tagProcessors.HEAD = function (dom, node, cssRules, dart, depth) {
}
tagProcessors.HEADtail = function (dom, node, cssRules, dart, depth) {
}

// Process BODY tag
tagProcessors.BODY = function (dom, node, cssRules, dart, depth) {
    var func = node.getAttribute("func");
    var indent = node.indent;

    // Top function 
    if (func != null) {
        let paramStr = node.getAttribute("params");

        if (paramStr == null) {
            log(`BAD FUNC TAG: BODY:${node.nodeLoc}, missing 'params'`);
            return;
        }
        let params = paramStr.trim().replace(/[\s]{2,}/g, "\x20").split("\x20");
        let str = `\n// Screen function\nScaffold ${func}({`;
        params = params.map(x => "required\x20" + x);
        str += params.join(",") + "}){\n";
        str += `${indent}return Scaffold(body: Stack(children:[\n`;
        dart.code += str;

    } else { // Regular div
        addMarker(dart, node);
        // dart.code += `${indent}// WRONG BODY TAG HERE`;
    }
}
tagProcessors.BODYtail = function (dom, node, cssRules, dart, depth) {
    var func = node.getAttribute("func");
    var indent = node.indent;

    // Top function
    if (func != null) {
        dart.code += `${indent}]));\n}\n`;

        // Flatten for the case children:[someForEachHere...
        dart.code += `// Mimic flutter-view.io\n` +
            `__flatten(List list) {\n` +
            `    return List<Widget>.from(list.expand((item) {\n` +
            `        return item is Iterable ? item : [item as Widget];\n` +
            `    }));\n` +
            `}\n` +
            `// EOF\n`;
    } else {
        // Nothing here
    }
}

// Process DIV tag
tagProcessors.DIV = function (dom, node, cssRules, dart, depth) {
    var func = node.getAttribute("func");
    var indent = node.indent;

    // Top function 
    if (func != null) {
        let paramStr = node.getAttribute("params");

        if (paramStr == null) {
            log(`BAD FUNC TAG: DIV:${node.nodeLoc}, missing 'params'`);
            return;
        }
        let params = paramStr.trim().replace(/[\s]{2,}/g, "\x20").split("\x20");
        let str = `\n// Component function\nContainer ${func}({`;
        params = params.map(x => "required\x20" + x);
        str += params.join(",") + "}){\n";
        str += `${indent}return Container(child:\n`;
        dart.code += str;

    } else { // Regular div
        addMarker(dart, node);
        let str = `${indent}Container(width:double.infinity,\n`;
        dart.code += str;
        processAttributes(dom, node, cssRules, dart, depth);

        str = `${indent}${TAB}child:Wrap(children:__flatten([\n`;
        dart.code += str;
    }
}
tagProcessors.DIVtail = function (dom, node, cssRules, dart, depth) {
    var func = node.getAttribute("func");
    var indent = node.indent;

    // Top function
    if (func != null) {
        dart.code += `${indent});\n}\n`;

        // Flatten for the case children:[someForEachHere...    
        dart.code += `// Mimic flutter-view.io\n` +
            `__flatten(List list) {\n` +
            `    return List<Widget>.from(list.expand((item) {\n` +
            `        return item is Iterable ? item : [item as Widget];\n` +
            `    }));\n` +
            `}\n` +
            `// EOF\n`;
    } else { // Regular div
        let str = `${indent}])))${comma(node)}\n`;
        dart.code += str;
    }
}

// Process BUTTON tag
tagProcessors.BUTTON = function (dom, node, cssRules, dart, depth) {
    var indent = node.indent;

    addMarker(dart, node);
    var str = `${indent}Container(\n`;
    dart.code += str;
    var childAttrs = processAttributes(dom, node, cssRules, dart, depth);
    var childAttrLines = makeChildAttrLines(indent, childAttrs);
    var str = `${indent}${TAB}child: ElevatedButton(${childAttrLines}child: Wrap(children:__flatten([\n`;
    dart.code += str;
}
tagProcessors.BUTTONtail = function (dom, node, cssRules, dart, depth) {
    var indent = node.indent;

    var str = `${indent}]))))${comma(node)}\n`;
    dart.code += str;
}

// Process SPAN tag
tagProcessors.SPAN = function (dom, node, cssRules, dart, depth) {
    var indent = node.indent;

    addMarker(dart, node);
    var str = `${indent}Container(\n`;
    dart.code += str;
    processAttributes(dom, node, cssRules, dart, depth);

    var str = `${indent}${TAB}child: Wrap(children:__flatten([\n`;
    dart.code += str;
}
tagProcessors.SPANtail = function (dom, node, cssRules, dart, depth) {
    var indent = node.indent;

    var str = `${indent}])))${comma(node)}\n`;
    dart.code += str;
}

// Process A tag
tagProcessors.A = function (dom, node, cssRules, dart, depth) {
    var indent = node.indent;

    addMarker(dart, node);
    var str = `${indent}TextButton(\n`;
    dart.code += str;
    processAttributes(dom, node, cssRules, dart, depth);

    var str = `${indent}${TAB}child:\n`;
    dart.code += str;
}
tagProcessors.Atail = function (dom, node, cssRules, dart, depth) {
    var indent = node.indent;

    var str = `${indent})${comma(node)}\n`;
    dart.code += str;
}

// Process IMG tag
tagProcessors.IMG = function (dom, node, cssRules, dart, depth) {
    var indent = node.indent;
    var src = node.getAttribute("src");
    var fallbacksrc = node.getAttribute("fallbacksrc"); // Always asset:
    var isAsset = false;

    if (src.trim().toLowerCase().startsWith("asset:")) {
        src = src.slice("asset:".length);
        isAsset = true;
    }

    addMarker(dart, node);
    var str;
    var [todo, parsedSrc] = parseText(src);

    if (todo == NO_QUOTES) {
        if (isAsset)
            str = `${indent}Image.asset(${parsedSrc}\n`;
        else
            str = `${indent}Image.network(${parsedSrc}\n`;
    } else {
        if (isAsset)
            str = `${indent}Image.asset("${parsedSrc}"\n`;
        else
            str = `${indent}Image.network("${parsedSrc}"\n`;
    }

    dart.code += str;
}
tagProcessors.IMGtail = function (dom, node, cssRules, dart, depth) {
    var indent = node.indent;

    let str = `${indent})${comma(node)}\n`;
    dart.code += str;
}

// Process text node
function processTextNode(dom, node, cssRules, dart, depth) {
    if (node.textContent.trim().length == 0) return;
    var indent = node.indent;
    var text = node.textContent;
    var [todo, parsedText] = parseText(text);

    if (todo == WITH_QUOTES) {
        text = node.textContent.replaceAll("\n", "\x20").replace(/[\x20]{2,}/g, "\x20")
            .replaceAll('"', '\\"');
        dart.code += `${indent}${TAB}Text("${text.trim()}")\n`;
    }
    else
        dart.code += `${indent}${TAB}Text(${parsedText.trim()})\n`;
}

// Process comment node
function processCommentNode(dom, node, cssRules, dart, depth) {
    if (node.textContent.trim().length == 0) return;
    var indent = node.indent;
    var text = node.textContent;
    dart.code += `${indent}/*${text.trim()}*/\n`;
}

var ____Main_Conv____;

// Process import tags
function processImports(dom, root, dart) {
    var eles = [...root.querySelectorAll("import")];

    for (let ele of eles) {
        let path = ele.getAttribute("path");

        if (path == null) {
            log(`BAD IMPORT: Line: ${dom.nodeLocation(ele).startLine}`);
            continue;
        }
        dart.code += `import "${path}";\n`;
        ele.remove();
    }
}

// Process 'if' clause
function processIfOnly(dom, node, cssRules, dart, depth) {
    var clause = node.getAttribute("if");
    var indent = node.indent;
    dart.code += `\n${indent}${clause}?\n`;

    return `:SizedBox(),`;
}

// Process 'foreach' clause
function processForOnly(dom, node, cssRules, dart, depth) {
    var arr = node.getAttribute("foreach");
    var indent = node.indent;
    dart.code += `\n${indent}${arr}.map((x)=>\n`;

    return `),`;
}

// Process 'if' clause and 'foreach' clause on the same tag
function processIfAndFor(dom, node, cssRules, dart, depth) {
}

// Travel to element in dom
function travelToEle(dom, node, cssRules, dart, depth) {
    var nodeLoc = dom.nodeLocation(node);
    nodeLoc = nodeLoc ? nodeLoc.startLine : "?";
    node.nodeLoc = nodeLoc;
    // Spacing
    if (depth < 0)
        var indent = "";
    else
        var indent = "\x20\x20\x20\x20".repeat(depth);

    node.indent = indent;

    if (node.nodeType == ELEMENT_NODE) {
        var havingIfOnly = node.getAttribute("if") != null && node.getAttribute("foreach") == null;
        var havingForOnly = node.getAttribute("if") == null && node.getAttribute("foreach") != null;
        var havingIfAndFor = node.getAttribute("if") != null && node.getAttribute("foreach") != null;
        var havingLogicTail = havingIfOnly == true || havingForOnly == true || havingIfAndFor == true;
        var tailOfIfAndFor = "";
    }

    if (node.nodeType == ELEMENT_NODE) {
        log(`${node.tagName}:${nodeLoc}`);

        if (node.tagName == "BODY" && node.getAttribute("func") != null) {
            node.indent = TAB + node.indent;
            depth++;
        }
        if (typeof tagProcessors[node.tagName] != "function") {
            log(`UNIMPLEMENTED TAG ${node.tagName}:${nodeLoc}`);
            return;
        }
        // Logic
        if (havingIfOnly)
            tailOfIfAndFor = processIfOnly(dom, node, cssRules, dart, depth);
        else if (havingForOnly)
            tailOfIfAndFor = processForOnly(dom, node, cssRules, dart, depth);
        else if (havingIfAndFor)
            tailOfIfAndFor = processIfAndFor(dom, node, cssRules, dart, depth);

        tagProcessors[node.tagName](dom, node, cssRules, dart, depth);
    }
    else if (node.nodeType == TEXT_NODE)
        processTextNode(dom, node, cssRules, dart, depth);
    else if (node.nodeType == COMMENT_NODE)
        processCommentNode(dom, node, cssRules, dart, depth);
    else
        log(`BAD NODE: Line: ${nodeLoc}`);

    for (let childNode of node.childNodes)
        travelToEle(dom, childNode, cssRules, dart, depth + 1);

    if (node.nodeType == ELEMENT_NODE) {
        tagProcessors[node.tagName + "tail"](dom, node, cssRules, dart, depth);

        if (havingLogicTail)
            dart.code += `${indent}${tailOfIfAndFor}\n`;
    }
}

// Convert html+css files to dart
function convertToDart(htmlFilePath, cssFilePath, dartFilePath) {
    var htmlContent = fs.readFileSync(htmlFilePath, 'utf-8');
    var cssContent = fs.readFileSync(cssFilePath, 'utf-8');
    log("HTML length:", htmlContent.length);
    log("CSS length:", cssContent.length);

    // HTML
    log("Parsing HTML...");
    var dom = new JSDOM(htmlContent, {
        // WARN: Need this or the tag after a self-closing tag becomes child.
        contentType: "text/html", // 'application/xml',
        includeNodeLocations: true
    });
    log("HTML parsed");
    var document = dom.window.document;
    var rootEle = document.documentElement; // flutter-html tag
    // var body = document.querySelector("body"); // No 'body' in xml
    // log(rootEle.outerHTML);
    // Sample DOM got:
    /* <html><head></head><body>
           <main name="MainUiView" with=...*/

    // Parse tag-def
    var tagDefs = [...rootEle.querySelectorAll("tagdef")];
    var tagDefMap = {};

    for (let def of tagDefs) {
        tagDefMap[def.getAttribute("name")] = def.children[0];
    }
    for (let tagName of Object.keys(tagDefMap)) {
        let nodes = [...rootEle.querySelectorAll(tagName)];
        log(tagName, "->", nodes.length, "nodes");

        for (let node of nodes)
            node.replaceWith(tagDefMap[tagName]);
    }
    var tagDefs = [...rootEle.querySelectorAll("tagdef")];
    tagDefs.forEach(x => x.remove());

    // CSS
    log("Parsing CSS...");
    const sheet = CSSOM.parse(cssContent);
    log("CSS parsed");
    // console.log(sheet.cssRules);

    for (let rule of sheet.cssRules) {
        let selector = rule.selectorText;
        let eles = [...document.querySelectorAll(selector)];

        for (let ele of eles) {
            for (let i = 0; i < rule.style.length; i++) {
                let key = rule.style[i];
                let value = rule.style[key];
                ele.setAttribute("h2d-" + key, value);
            }
        }
    }

    // Convert to dart
    ELEMENT_NODE = dom.window.Node.ELEMENT_NODE;
    TEXT_NODE = dom.window.Node.TEXT_NODE;
    COMMENT_NODE = dom.window.Node.COMMENT_NODE;

    var dart = {
        code: "// This file was generated by html2dart\n"
    };
    processImports(dom, rootEle, dart);
    travelToEle(dom, rootEle, sheet, dart, -1); // -1 to ignore root tag indent
    // log("Dart code ========================================");
    // log(dart.code);
    // log("========================================");
    fs.writeFileSync(dartFilePath, dart.code);
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
(async function main() {
    log("\nStarting html2dart");
    log("Current dir:", process.cwd());
    log("CLI args:", process.argv);
    var relativePath = process.argv.slice(-1)[0];
    relativePath = "./" + relativePath;

    if (process.argv.length != 3) {
        log("Currently run as: node main.mjs lib");
        log("Usage: html2dart <relative-path-without-dot>");
        process.exit();
    }
    const files = await glob(relativePath + '/**/*.html');
    log("HTML files found:");
    log(files);

    chokidar.watch(relativePath, {
        usePolling: true // Equivalent to nodemon -L
    }).on('change', async (f) => {
        if (/\.(html|css)$/.test(f)) {
            console.clear(); // Doesnt clear in vscode/antig terminal
            console.log('\nChanged:', f);
            f = f.replace(/\.[a-z]+$/, ".html");
            let htmlFilePath = f;
            let cssFilePath = f.replace(/\.html$/, '.css');
            let dartFilePath = f.replace(/\.html$/, '.dart');
            // log("HTML file:",htmlFilePath);
            // log("CSS  file:",cssFilePath);
            // log("Dart file:",dartFilePath);

            if (!await fileExists(cssFilePath)) {
                log(`Missing CSS, skipping ${f}`);
                return;
            }
            // Convert            
            log("Processing modified file:", htmlFilePath);
            convertToDart(htmlFilePath, cssFilePath, dartFilePath);
        }
    });
})();
// EOF

