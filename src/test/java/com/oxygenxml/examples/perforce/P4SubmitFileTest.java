package com.oxygenxml.examples.perforce;

import java.io.File;
import java.io.IOException;
import java.io.PrintWriter;
import java.time.LocalDateTime;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class P4SubmitFileTest {

	@Rule
	public TemporaryFolder folder = new TemporaryFolder();

	@Test
	public void testOverwritingExistingFile() throws IOException {
		String filename = "test3.txt";

		final File file = folder.newFile(filename);
		System.out.println(file.getAbsolutePath());

		String content = LocalDateTime.now().toString();
		try (PrintWriter writer = new PrintWriter(file)) {
			writer.write(content);
			writer.flush();
		}

		P4SubmitFile pd = new P4SubmitFile();
		// folder //depot/level1 must exist
		pd.put(file, "//depot/level1/" + filename, true);
	}
	

}
