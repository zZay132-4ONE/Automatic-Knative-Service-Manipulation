/**
 * A VS Code extension which can help developers automatically deploying Knative services to the Kubernetes cluster. 
 * It currently supports the following commands:
 * 	- Deploy Service: deploy a Knative service to Kubernetes (require inputs "register name" and "image name").
 *  - Get Service Info: print detailed information about the specified Knative service (require input "service name").
 *  - Delete Service: delete the specified Knative Service (require input "service name").
 *  - Test Extension: test whether the extension is working properly.
 * 
 * @author Dongzhi Zhang
 */

import * as vscode from 'vscode';
import * as childProcess from 'child_process';
import * as util from 'util';
import * as fs from 'fs';

const EXTENSION_NAME = 'automatic-knative-service-manipulation';
const exec = util.promisify(childProcess.exec);

/**
 * This function is called when the extension is activated, responsible for registering commands.
 * 
 * @param {vscode.ExtensionContext} context - The context where the extension is executed.
 */
export function activate(context: vscode.ExtensionContext) {
	console.log(`Extension "${EXTENSION_NAME}" is activated.\n`);

	// Command for deploying the Knative service to Kubernetes
	let cmdDeployment = vscode.commands.registerCommand(`${EXTENSION_NAME}.deployService`, async () => {
		vscode.window.showInformationMessage(`Start to deploy the task to Knative.`);
		const registryName = await vscode.window.showInputBox({
			prompt: "Please enter the name of the Docker image registry",
			placeHolder: "docker.io/username"
		});
		const imageName = await vscode.window.showInputBox({
			prompt: "Please enter the name of the Docker image",
			placeHolder: `${EXTENSION_NAME}`
		});
		if (!registryName || !imageName) {
			vscode.window.showErrorMessage("Deployment terminated: valid registry and image name must be provided.");
			return;
		}
		deployKnativeService(registryName, imageName);
	});

	// Command for printing detailed information about the specified Knative service
	let cmdGetServiceInfo = vscode.commands.registerCommand(`${EXTENSION_NAME}.getServiceInfo`, async () => {
		const serviceName = await vscode.window.showInputBox({
			prompt: "Please enter the name of the service"
		});
		if (!serviceName) {
			vscode.window.showErrorMessage("Service name must be provided.");
			return;
		}
		printKnativeServiceInfo(serviceName);
	});

	// Command for deleting the Knative service from the Kubernetes cluster
	let cmdDelete = vscode.commands.registerCommand(`${EXTENSION_NAME}.deleteService`, async () => {
		const serviceName = await vscode.window.showInputBox({
			prompt: "Please enter the name of the service to be deleted"
		});
		if (!serviceName) {
			vscode.window.showErrorMessage("Service name must be provided.");
			return;
		}
		deleteKnativeService(serviceName);
	});

	// Command for testing if the extension is activated and working properly
	let cmdHelloWorld = vscode.commands.registerCommand(`${EXTENSION_NAME}.testExtension`, () => {
		vscode.window.showInformationMessage(`Extension ${EXTENSION_NAME} is working properly.`);
	});

	context.subscriptions.push(cmdHelloWorld, cmdDeployment, cmdGetServiceInfo, cmdDelete);
}

/**
 * This function is called when the extension is deactivated.
 */
export function deactivate() { }

/* ============================== Command: Deploy Task ==============================*/

/**
 * This function automates the process of deploying a Knative service to Kubernetes:
 * 	(1) Create the Dockerfile. 
 * 	(2) Build the Docker image based on the Dockerfile.
 * 	(3) Push the built Docker image to the registry.
 * 	(4) Creat the Knative service YAML configuration.
 * 	(5) Apply the YAML configuration and deploy the Knative service to the Kubernetes cluster.
 * 
 * @param registryName Name of the Docker image registry.
 * @param imageName Name of the Docker image.
 */
async function deployKnativeService(registryName: string, imageName: string) {
	// Should not continue to deploy if no valid folder is opened.
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders) {
		vscode.window.showErrorMessage("No valid folder is opened.");
		return;
	}

	// Create the Dockerfile, build the Docker image based on it, and push the image to the registry
	const workSpaceFolderPath = workspaceFolders[0].uri.fsPath;
	const dockerImageUri = `${registryName}/${imageName}`;
	await createDockerfile(workSpaceFolderPath);
	const buildImageSuccess = await buildDockerImage(dockerImageUri, workSpaceFolderPath);
	if (!buildImageSuccess) {
		return;
	}
	const pushImageSuccess = await pushDockerImage(dockerImageUri);
	if (!pushImageSuccess) {
		return;
	}

	// Create the YAML file for Knative to deploy the service and apply the configuration
	const knativeConfPath = `${workSpaceFolderPath}/${imageName}-service.yaml`;
	const kantiveServiceName = `${imageName}-service`;
	await createKnativeConf(knativeConfPath, dockerImageUri, kantiveServiceName);
	const applyConfSuccess = await applyKnativeConf(knativeConfPath);
	if (!applyConfSuccess) {
		return;
	}
	console.log(`Knative service "${kantiveServiceName}" is deployed.`);
	console.log(`You can use command "Get Service Info" to check its details.`);
}

/**
 * Create the Dockerfile needed.
 * 
 * @param workSpaceFolderPath Path of the directory where the Dockerfile should reside.
 */
async function createDockerfile(workSpaceFolderPath: string) {
	const dockerFilePath = `${workSpaceFolderPath}/Dockerfile`;
	vscode.window.showInformationMessage(`Creating the Dockerfile.`);
	console.log("Start creating the Dockerfile.");
	const DOCKERFILE_CONTENT =
		`FROM python:3.8-slim
COPY . /app
WORKDIR /app
RUN pip3 install --upgrade pip
RUN pip3 install flask torch transformers 
EXPOSE 5000
CMD ["python3", "app.py"]`;
	fs.writeFileSync(dockerFilePath, DOCKERFILE_CONTENT);
	vscode.window.showInformationMessage(`Succcessfully created the Dockerfile.`);
	console.log("Successfully created the Dockerfile.\n");
}

/**
 * Build the docker image based on the specified Dockerfile.
 * 
 * @param dockerImageUri URI of the docker image to be built.
 * @param contextDir Directory where the Dockerfile resides.
 * @returns {Promise<boolean>} Whether successfully built the Docker image. 
 */
async function buildDockerImage(dockerImageUri: string, contextDir: string): Promise<boolean> {
	const buildImageCmd = `docker build -t ${dockerImageUri} .`;
	vscode.window.showInformationMessage(`Building the Docker image "${dockerImageUri}".`);
	console.log("Start building the Docker image.");
	try {
		const { stdout, stderr } = await exec(buildImageCmd, { cwd: contextDir });
		vscode.window.showInformationMessage(`Succcessfully built the Docker image.`);
		console.log(`Successfully built the Docker image "${dockerImageUri}".\n`);
		return true;
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to build the Docker image.`);
		console.error(error);
		return false;
	}
}

/**
 * Push the Docker image to the registry. 
 * 
 * @param dockerImageUri URI of the docker image to be built.
 * @returns {Promise<boolean>} Whether successfully pushed the Docker image. 
 */
async function pushDockerImage(dockerImageUri: string): Promise<boolean> {
	const pushImageCmd = `docker push ${dockerImageUri}`;
	vscode.window.showInformationMessage(`Pushing the Docker image.`);
	console.log("Start pushing the Docker image.");
	try {
		const { stdout, stderr } = await exec(pushImageCmd);
		vscode.window.showInformationMessage(`Succcessfully pushed the Docker image.`);
		console.log(`Successfully pushed the Docker image ${dockerImageUri}.\n`);
		return true;
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to push the Docker image.`);
		console.error(error);
		return false;
	}
}

/**
 * Create the Knative service YAML configuration for the deployment.
 * 
 * @param knativeConfPath Path of the Knative service YAML configuration.
 * @param dockerImageUri URI of the docker image to be built.
 * @param kantiveServiceName Name of the Knative service.
 */
async function createKnativeConf(knativeConfPath: string, dockerImageUri: string, kantiveServiceName: string) {
	const knativeConfContent =
		`apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: ${kantiveServiceName}
spec:
  template:
    spec:
      containers:
      - image: ${dockerImageUri}
        ports:
        - containerPort: 5000`;
	vscode.window.showInformationMessage(`Creating the Knative configuration.`);
	console.log("Start creating the Knative configuration.");
	fs.writeFileSync(knativeConfPath, knativeConfContent);
	vscode.window.showInformationMessage(`Succcessfully created the Knative configuration.`);
	console.log("Successfully created the Knative configuration.\n");
}

/**
 * Apply the Knative service configuration to deploy the service.
 * 
 * @param knativeConfPath Path of the Knative service YAML configuration.
 * @returns {Promise<boolean>} Whether successfully applied the Knative configuration. 
 */
async function applyKnativeConf(knativeConfPath: string): Promise<boolean> {
	const applyConfCmd = `kubectl apply -f ${knativeConfPath}`;
	vscode.window.showInformationMessage(`Applying the Knative configuration.`);
	console.log("Start applying the Knative configuration.");
	try {
		const { stdout, stderr } = await exec(applyConfCmd);
		vscode.window.showInformationMessage(`Succcessfully deployed the Knative service to Kubernetes.`);
		console.log("Successfully applied the Knative configuration.\n");
		return true;
	} catch (error) {
		vscode.window.showErrorMessage(`Failed to deploy the Knative service to Kubernetes.`);
		console.error(error);
		return false;
	}
}

/* ============================ Command: Get Service Info ===========================*/

/**
 * Print useful information about the deployed Knative service.
 * 
 * @param serviceName Name of the Knative service.
 */
async function printKnativeServiceInfo(serviceName: string) {
	const getServiceInfoCmd = `kubectl get ksvc ${serviceName} -o json`;
	try {
		// Retrieve the service information in JSON format
		const { stdout, stderr } = await exec(getServiceInfoCmd);
		console.log("========== Deployed Knative Service Information ==========");
		const serviceInfoJson = JSON.parse(stdout);
		const status = serviceInfoJson.status.conditions.find((cond: any) => cond.type === "Ready").status;
		const url = serviceInfoJson.status.url;
		// Parse the JSON-format information into string representation
		let serviceInfo = `Service Name: ${serviceName}\n`;
		serviceInfo += `Status: ${status === "True" ? "Ready" : "Not Ready\n"}`;
		serviceInfo += `URL: ${url}`;
		console.log(serviceInfo);
		console.log("==========================================================\n");
	} catch (error) {
		vscode.window.showErrorMessage("Failed to print Knative service information.");
		console.error("Failed to print Knative service info: ", error);
	}
}

/* ============================== Command: Delete Task ==============================*/

/**
 * Delete the specified Knative service.
 * 
 * @param serviceName Name of the Knative service to be deleted.
 */
async function deleteKnativeService(serviceName: string) {
	const deleteServiceCmd = `kubectl delete ksvc ${serviceName}`;
	vscode.window.showInformationMessage(`Deleting the Knative service ${serviceName}.`);
	console.log(`Start deleting the Knative service ${serviceName}.`);
	try {
		const { stdout, stderr } = await exec(deleteServiceCmd);
		vscode.window.showInformationMessage(`Successfully deleted the Knative service: ${serviceName}`);
		console.log(`Successfully deleted the Knative service ${serviceName}.\n`);

	} catch (error) {
		console.error(error);
		vscode.window.showErrorMessage(`Failed to delete the service: ${serviceName}`);
	}
}
