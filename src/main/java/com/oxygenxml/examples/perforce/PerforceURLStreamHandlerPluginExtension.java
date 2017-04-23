package com.oxygenxml.examples.perforce;

import java.net.URLStreamHandler;

import ro.sync.exml.plugin.urlstreamhandler.URLStreamHandlerPluginExtension;
import ro.sync.exml.workspace.api.Platform;
import ro.sync.exml.workspace.api.PluginWorkspaceProvider;

public class PerforceURLStreamHandlerPluginExtension implements  URLStreamHandlerPluginExtension {

	public URLStreamHandler getURLStreamHandler(String protocol) {
	    
	    boolean isWebapp = Platform.WEBAPP.equals(PluginWorkspaceProvider.getPluginWorkspace().getPlatform());
	    URLStreamHandler handler = null;
	    
	    // If this is a url like: perforce-http://depot/params
	    if (isWebapp && protocol.contains("perforce")) {
	      //handler = new GithubUrlStreamHandler();
	    }
	    
	    return handler;
	}
	
}
