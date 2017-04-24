package com.oxygenxml.examples.perforce;

import java.net.URLStreamHandler;

import ro.sync.exml.plugin.urlstreamhandler.URLStreamHandlerPluginExtension;
import ro.sync.exml.workspace.api.Platform;
import ro.sync.exml.workspace.api.PluginWorkspaceProvider;

public class PerforceURLStreamHandlerPluginExtension implements URLStreamHandlerPluginExtension {

	public URLStreamHandler getURLStreamHandler(String protocol) {
		boolean isWebapp = Platform.WEBAPP.equals(PluginWorkspaceProvider.getPluginWorkspace().getPlatform());
		URLStreamHandler handler = null;

		// the URL must be like:
		// perforce*://server:port//depot/dir1/dir2/file.xml
		if (isWebapp && protocol.startsWith("perforce")) {
			handler = new PerforceUrlStreamHandler();
		}

		return handler;
	}

}
